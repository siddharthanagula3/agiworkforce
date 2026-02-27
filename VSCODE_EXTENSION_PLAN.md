# AGI Workforce VS Code Extension — Full Implementation Plan

**Version**: 1.0.0
**Last Updated**: 2026-02-27
**Status**: Scaffold complete (Phase 0 done). Phases 1–6 to implement.

---

## What We Have Already (Phase 0 — Complete)

The scaffold at `apps/extension-vscode/` contains:

| File                               | Status      | What It Does                                                                                                              |
| ---------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------------------------- |
| `package.json`                     | ✅ Complete | Extension manifest: 8 commands, @agi chat participant, sidebar webview, 6 config properties, keybindings                  |
| `src/extension.ts`                 | ✅ Complete | Activation: registers chat participant, sidebar, 8 commands, status bar item, first-run prompt                            |
| `src/providers/chatParticipant.ts` | ✅ Complete | `@agi` chat handler: 6 slash commands, editor context gathering, SSE streaming, vscode.lm fallback, follow-up suggestions |
| `src/providers/sidebarProvider.ts` | ✅ Complete | Activity bar webview: full chat UI with AGI Workforce design tokens, message bubbles, streaming, login prompt             |
| `src/utils/api.ts`                 | ✅ Complete | HTTP client: Bearer token auth, SSE streaming (Node.js `https`), `AgiWorkforceApiError`, cancellation                     |
| `tsconfig.json`                    | ✅ Complete | ES2022, CommonJS, strict, noUncheckedIndexedAccess                                                                        |
| `esbuild.js`                       | ✅ Complete | Build: dev/watch/production modes, externalizes `vscode`                                                                  |
| `.vscodeignore`                    | ✅ Complete | Excludes src/, node_modules/ from VSIX                                                                                    |

### Gaps in Phase 0

- `media/icon.png` — **missing** (referenced in package.json) — **CRITICAL: blocks packaging**
- `media/icon-sidebar.svg` — **missing** (referenced in package.json) — **CRITICAL: sidebar won't show**
- `media/icon-chat.png` — **missing** (referenced in chatParticipant.ts) — chat avatar placeholder
- Model list in `selectModel` command uses **outdated IDs** (gpt-4o, gpt-4o-mini, claude-haiku-3-5 — these are old)
- **No tests** (devDependencies include `@vscode/test-cli` but no test files)
- **No README.md** (required for Marketplace)
- **No CHANGELOG.md** (required for Marketplace)
- **No CI/CD** (no GitHub Actions for build + publish)
- Sidebar messages render as **plain text** — no Markdown rendering (code blocks, bold, links)
- Conversation history is **ephemeral** — lost when sidebar closes/reopens
- `/model` slash command **does not switch models** — only echoes available models
- `api.ts`: no retry logic for transient network errors; no timeout config; no token counting
- `extension.ts:39`: opens Chat panel but **does not focus input** (UX friction)
- `api.ts:342`: missing null check on `choices[0].message.content`

---

## AGI Workforce API Integration (from audit)

| Endpoint                                | Method | Purpose                                       |
| --------------------------------------- | ------ | --------------------------------------------- |
| `/api/llm/v1/chat/completions`          | POST   | SSE streaming LLM (already in `api.ts`)       |
| `/api/chat/conversations`               | GET    | List conversations                            |
| `/api/chat/conversations`               | POST   | Create conversation                           |
| `/api/chat/conversations/{id}`          | GET    | Get conversation + messages                   |
| `/api/chat/conversations/{id}`          | PUT    | Rename                                        |
| `/api/chat/conversations/{id}`          | DELETE | Soft delete                                   |
| `/api/chat/conversations/{id}/messages` | POST   | Save message (use `skipLlm: true` for manual) |

Auth: `Authorization: Bearer {supabase_jwt}` — stored in VS Code SecretStorage as `agiWorkforce.apiKey`.

### Current Model Catalog (correct IDs from audit)

**Economy**: `gpt-5-nano`, `gemini-3-flash-preview`, `deepseek-chat`, `claude-haiku-4.5`, `sonar`
**Pro**: `gpt-5.2`, `claude-sonnet-4.6`, `gemini-3-pro-preview`, `qwen-max`, `sonar-pro`
**Max**: `gpt-5-pro`, `claude-opus-4.6`, `grok-4`, `o3`, `deepseek-r1`
**Auto**: `auto-economy`, `auto-balanced`, `auto-premium`

---

## Phase 1: Polish & Fix Phase 0 Gaps (~5 files)

**Goal**: Make the existing scaffold fully functional with correct icons and model IDs.

### Files to create/modify:

**`apps/extension-vscode/media/`** — Create 3 icon files:

- `icon.png` (128×128 px) — Main extension icon for Marketplace listing
- `icon-sidebar.svg` — Activity bar icon (monochrome, 24×24 px)
- `icon-chat.png` (16×16 px) — @agi chat participant avatar

**`apps/extension-vscode/src/extension.ts`** — Update model list in `selectModel`:

```typescript
// Replace with current model IDs from audit:
{ label: 'auto-balanced', description: 'Smart routing — best model per task', ... },
{ label: 'claude-sonnet-4.6', description: 'Anthropic — best all-rounder', ... },
{ label: 'claude-opus-4.6', description: 'Anthropic flagship', ... },
{ label: 'gpt-5.2', description: 'OpenAI — mid-tier general', ... },
{ label: 'gpt-5-pro', description: 'OpenAI flagship', ... },
{ label: 'gemini-3-flash-preview', description: 'Google — fast', ... },
{ label: 'gemini-3-pro-preview', description: 'Google — strong', ... },
{ label: 'deepseek-chat', description: 'DeepSeek — balanced', ... },
{ label: 'deepseek-r1', description: 'DeepSeek — reasoning', ... },
{ label: 'sonar', description: 'Perplexity — fast search', ... },
```

**`apps/extension-vscode/src/providers/sidebarProvider.ts`** — Fix auth flow:

- When user clicks "Set API Key" in webview, post a message `{ type: 'openSetApiKey' }` to extension
- Extension handles it by executing `agi-workforce.setApiKey` command

**`apps/extension-vscode/README.md`** — Marketplace listing page:

- Features, screenshots, usage, configuration reference, privacy policy link

**`apps/extension-vscode/CHANGELOG.md`** — Version history

---

## Phase 2: Inline Code Intelligence (~4 files)

**Goal**: Add code-level integrations that appear directly in the editor, like Copilot's ghost text and quick-fix lightbulbs.

### 2a. Code Actions (Quick Fix Lightbulb)

**`src/providers/codeActionProvider.ts`**

Register a `vscode.languages.registerCodeActionsProvider('*', ...)` that:

- Adds lightbulb actions when code is selected: "Explain with AGI", "Fix with AGI", "Refactor with AGI"
- Adds lightbulb actions on error diagnostics: "AGI Workforce: Fix this error"
- Uses `vscode.CodeActionKind.QuickFix` and `vscode.CodeActionKind.Refactor`
- Each action executes the corresponding inline command

Register in `extension.ts`:

```typescript
import { AgiCodeActionProvider } from './providers/codeActionProvider';
context.subscriptions.push(
  vscode.languages.registerCodeActionsProvider('*', new AgiCodeActionProvider(), {
    providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.Refactor],
  }),
);
```

### 2b. Hover Provider

**`src/providers/hoverProvider.ts`**

Register a `vscode.languages.registerHoverProvider('*', ...)` that:

- On hover over a symbol: shows a `vscode.MarkdownString` with "Ask AGI Workforce" link
- Clicking the link fires `agi-workforce.explain` with the hovered word pre-selected
- Only activates if `agiWorkforce.hoverEnabled` config is true (default: false to avoid noise)

### 2c. Apply Fixes as Diffs (WorkspaceEdit)

**`src/utils/applyEdit.ts`**

Replace the current "open new markdown doc" approach in `runInlineCommand` with:

1. Parse the LLM response to extract fenced code blocks
2. If a code block matches the current selection's language, offer to apply it:
   - `vscode.window.showInformationMessage('Apply fix?', 'Apply', 'View in New Tab')`
   - If "Apply": use `vscode.workspace.applyEdit()` to replace the selection in-place
   - Show diff first: `vscode.commands.executeCommand('vscode.diff', originalUri, newUri)`
3. For `/fix` and `/refactor` commands specifically

### 2d. Update package.json

Add config properties:

```json
"agiWorkforce.hoverEnabled": { "type": "boolean", "default": false, "description": "Show AGI Workforce option in hover tooltips" },
"agiWorkforce.autoApplyFixes": { "type": "boolean", "default": false, "description": "Automatically offer to apply AI-generated fixes inline" }
```

---

## Phase 3: Conversation History & Sync (~5 files)

**Goal**: Persist conversations across VS Code sessions and optionally sync to AGI Workforce cloud.

### 3a. Conversation TreeView

**`src/providers/conversationTreeProvider.ts`**

Add a `vscode.TreeDataProvider` that shows conversation history in the sidebar:

- Root items: conversation titles (from cloud or local)
- Second level: last 3 messages preview
- Commands: click to restore conversation in sidebar webview, delete conversation
- Refresh button in view toolbar

Add to `package.json` views:

```json
{
  "id": "agi-workforce.conversations",
  "name": "Conversations",
  "type": "tree"
}
```

### 3b. Local Conversation Storage

**`src/storage/conversationStore.ts`**

Use `vscode.ExtensionContext.globalState` (or `workspaceState` for workspace-scoped) to persist:

```typescript
interface StoredConversation {
  id: string;
  title: string;
  messages: Array<{ role: string; content: string; timestamp: number }>;
  model: string;
  createdAt: number;
  updatedAt: number;
  synced: boolean; // true if also saved to cloud
}
```

Max 50 conversations stored locally; prune oldest on overflow.

### 3c. Cloud Sync (optional, behind config)

**`src/services/cloudSync.ts`**

If `agiWorkforce.syncConversations` is enabled:

- On new conversation: `POST /api/chat/conversations`
- On message: `POST /api/chat/conversations/{id}/messages` with `skipLlm: true`
- On load: `GET /api/chat/conversations` to restore history
- Uses the API endpoints documented in the audit

### 3d. Sidebar webview conversation list

Update `sidebarProvider.ts` to:

- Show conversation list view (history) vs. active chat view
- "New Chat" button to start fresh
- Click conversation to load it

---

## Phase 4: Workspace Context & Multi-file Intelligence (~3 files)

**Goal**: Give the AI full project context, not just the current file.

### 4a. Workspace Indexer

**`src/services/workspaceIndexer.ts`**

Lightweight workspace indexer (no embeddings — just file listing + symbol extraction):

- `vscode.workspace.findFiles()` to get all source files (respects `.gitignore` via config)
- `vscode.commands.executeCommand('vscode.executeDocumentSymbolProvider', uri)` to get symbols per file
- Build a project map: `Map<string, { symbols: string[], size: number, language: string }>`
- Cap at 100 files + 5,000 symbols total to avoid context bloat
- Cache in `workspaceState` with 1-hour TTL
- Expose `getRelevantContext(query: string): string` that returns top 10 most relevant files/symbols

### 4b. Enhanced Chat Participant Context

Update `chatParticipant.ts` to use workspace context:

- For `/fix` and `/refactor`: include imported module symbols from the current file
- For general chat: include a compact workspace map summary (file tree + symbol count)
- For `/tests`: include existing test patterns from `__tests__/` or `*.test.*` files
- Add `@workspace` as a recognized reference in chat (maps to indexer output)

### 4c. Multiple file attach in sidebar

Update sidebar webview to support:

- "Attach file" button: pick from workspace via `vscode.window.showOpenDialog()`
- Attached files appear as chips above the input
- File content included in messages as additional context blocks

---

## Phase 5: Testing Infrastructure (~6 files)

**Goal**: Add comprehensive tests so the extension can be reliably maintained.

### Test framework: `@vscode/test-cli` (already in devDependencies)

**`src/test/suite/extension.test.ts`**

- Activate extension in test host
- Verify all 8 commands are registered
- Verify chat participant `agiworkforce.agi` is registered
- Verify status bar item shows

**`src/test/suite/chatParticipant.test.ts`**

- Unit test `buildSystemPrompt()` with various EditorContext inputs
- Unit test `buildUserMessage()` for each slash command
- Unit test `historyToMessages()` with mock chat history
- Mock `vscode.window.activeTextEditor` using `@vscode/test-electron`

**`src/test/suite/api.test.ts`**

- Mock `https.request` with nock or manual mock
- Test SSE parsing with real SSE event format from audit
- Test `AgiWorkforceApiError` classification
- Test cancellation handling

**`src/test/runTests.ts`** — Test runner entry point

**`.vscode/launch.json`** — Extension Host debug configuration:

```json
{
  "type": "extensionHost",
  "request": "launch",
  "name": "Run Extension",
  "args": ["--extensionDevelopmentPath=${workspaceFolder}/apps/extension-vscode"]
}
```

**`apps/extension-vscode/package.json` scripts update**:

```json
"test": "vscode-test --extensionDevelopmentPath=. --extensionTestsPath=./out/test/suite"
```

---

## Phase 6: CI/CD & Marketplace Publishing (~4 files)

**Goal**: Automated build, test, and publish pipeline.

### 6a. GitHub Actions workflow

**`.github/workflows/vscode-extension.yml`**

Triggers:

- Push to `main` with changes in `apps/extension-vscode/`
- Pull requests (build + typecheck + lint only)
- Manual dispatch (for publish)

Jobs:

1. **build**: `pnpm install` → `tsc --noEmit` → `node esbuild.js --production` → `vsce package`
2. **test**: `vscode-test` in headless Linux (Xvfb)
3. **publish** (manual only): `vsce publish` using `VSCE_PAT` secret

### 6b. Pre-publish checklist in package.json

Add:

```json
"prepublish": "pnpm run clean && pnpm run typecheck && node esbuild.js --production"
```

### 6c. Marketplace metadata

Update `package.json`:

- Add `"galleryBanner": { "color": "#0f0f0f", "theme": "dark" }`
- Add `"badges"` linking to GitHub Actions status
- Add `"preview": false` once stable
- Categories: `["AI", "Chat", "Programming Languages", "Other"]`

### 6d. Extension Pack (future)

Consider packaging as an **Extension Pack** that includes:

- AGI Workforce main extension
- A recommended theme pack
- A markdown preview extension

---

## Implementation Order & Priorities

```
Phase 0 (done) ─→ Phase 1 (quick wins: icons, model IDs, bug fixes)
                        ↓
              Phase 2 (code intelligence — competitive parity with Copilot)
                   ↕
              Phase 3 (conversation history — major UX improvement)   ← can parallel with 2
                   ↕
              Phase 4 (workspace context — power user feature)        ← can parallel with 3
                        ↓
              Phase 5 + 6 (tests + CI/CD → publish to Marketplace)
                        ↓
              Phase 7 (inline completions — ghost text)
                        ↓
              Phase 8 (agent mode + terminal)
                        ↓
              Phase 9 (MCP + desktop bridge — killer differentiator)
```

**Phases 2, 3, 4 can run in parallel** (independent files, no shared state).
**Phases 5 and 6 should follow** the first three to lock in a publishable v1.0.
**Phases 7, 8, 9** are v1.1+ features that make AGI Workforce the best extension available.

### Publishing milestone recommendation

- **v0.1.0**: Phases 0-1 complete → Internal testing via VSIX
- **v0.2.0**: Phases 2-4 complete → Beta publish (preview flag)
- **v1.0.0**: Phases 5-6 complete → Marketplace launch
- **v1.1.0**: Phase 7 → Inline completions
- **v1.2.0**: Phase 8 → Agent mode (our Cursor Composer moment)
- **v2.0.0**: Phase 9 → MCP + Desktop bridge (our killer differentiator)

---

## Phase 7: Inline Completions / Ghost Text (~2 files)

**Goal**: Add table-stakes ghost text completions. Every serious AI extension has this.

### 7a. Inline Completion Provider

**`src/providers/inlineCompletionProvider.ts`**

Register `vscode.languages.registerInlineCompletionItemProvider('*', ...)`:

- Debounce 250ms after user stops typing
- Send last 20 lines of context to `/api/llm/v1/chat/completions` with fast model (`claude-haiku-4.5` or `gpt-5-nano`)
- Return `InlineCompletionItem[]` with the suggested continuation
- Support multi-line completions (not just single-line)
- Respect user's configured model tier: fast model for completions regardless of chat model
- Add config: `agiWorkforce.inlineCompletions.enabled` (default: false — opt-in to avoid noise)
- Add config: `agiWorkforce.inlineCompletions.model` (default: `auto-economy`)

### 7b. Partial acceptance tracking

`handleDidPartiallyAcceptCompletionItem()` — track how many words accepted for telemetry (opt-in).

**package.json additions**:

```json
"agiWorkforce.inlineCompletions.enabled": { "type": "boolean", "default": false },
"agiWorkforce.inlineCompletions.model": { "type": "string", "default": "auto-economy" }
```

---

## Phase 8: Agent Mode + Terminal Integration (~5 files)

**Goal**: Autonomous multi-step task execution. This is what Cursor Composer, Continue Agent, and Copilot Agent all have. **Without this, the extension feels like just a chat wrapper.**

### 8a. Agent Mode in Sidebar

**`src/agent/agentRunner.ts`**

Agent loop:

1. User describes task in chat
2. Agent generates a plan (list of steps)
3. Shows plan to user: "Review plan before executing?" (yes/no toggle)
4. Executes steps in order: read files → edit files → run terminal commands → verify
5. Streams progress to sidebar chat: step completions, file diffs, command output
6. Asks for approval before destructive operations (if plan mode on)

Actions the agent can take:

- **Read file**: `vscode.workspace.fs.readFile(uri)` → include in context
- **Edit file**: `vscode.workspace.applyEdit(WorkspaceEdit)` → show diff first
- **Create file**: `vscode.workspace.fs.writeFile(uri, content)`
- **Run terminal command**: `vscode.window.createTerminal()` + `terminal.sendText(cmd)`
- **Search workspace**: `vscode.workspace.findFiles()` + symbol search

### 8b. Terminal Integration

**`src/services/terminal.ts`**

- Create named terminals: `AGI Workforce — Agent`
- Execute commands and capture output via `vscode.window.onDidWriteTerminalData`
- Parse output for errors, return to agent loop
- Show terminal panel when commands run

### 8c. Plan Mode Toggle

Add config `agiWorkforce.agent.planMode` (default: true):

- When true: agent shows plan and waits for user approval before executing
- When false: agent executes autonomously (power users)
- Toggle button in sidebar UI

---

## Phase 9: MCP Tool Integration (~3 files)

**Goal**: Connect to the user's existing MCP servers — same `.mcp.json` as the desktop app. This is our biggest differentiator over all competitors.

### 9a. MCP Client Bridge

**`src/mcp/mcpBridge.ts`**

- Read `.mcp.json` from workspace root (same format as desktop app)
- Connect to configured MCP servers (stdio + SSE transports)
- Expose available tools to the agent runner
- Reuse `@agiworkforce/utils` `SignalingClient` if applicable
- Tool calls show inline in chat as tool call cards (same pattern as desktop + mobile)

### 9b. Desktop App Bridge

**`src/mcp/desktopBridge.ts`**

- If AGI Workforce desktop is running locally, connect via WebSocket (`ws://localhost:7187/extension`)
- Show connected desktop agent status in sidebar
- Allow triggering desktop agents from VS Code: "Run agent on desktop"
- Receive agent status updates, approval requests
- This is the **unique killer feature** — no competitor has this

### 9c. package.json additions

```json
"agiWorkforce.mcp.enabled": { "type": "boolean", "default": true },
"agiWorkforce.desktopBridge.enabled": { "type": "boolean", "default": true },
"agiWorkforce.desktopBridge.port": { "type": "number", "default": 7187 }
```

---

## Feature Parity vs Competitors

| Feature                         | GitHub Copilot | Continue.dev | Cline     | **AGI Workforce**           |
| ------------------------------- | -------------- | ------------ | --------- | --------------------------- |
| Chat sidebar                    | ✅             | ✅           | ✅        | ✅ Phase 0                  |
| Context menus                   | ✅             | ✅           | ✅        | ✅ Phase 0                  |
| Multiple LLMs                   | ❌             | ✅           | ✅ (BYOK) | ✅ Phase 0                  |
| SSE streaming                   | ✅             | ✅           | ✅        | ✅ Phase 0                  |
| Code action lightbulbs          | ✅             | ✅           | ❌        | 🔲 Phase 2                  |
| Apply-as-diff                   | ✅             | ✅           | ✅        | 🔲 Phase 2                  |
| Conversation history tree       | ❌             | ✅           | ✅        | 🔲 Phase 3                  |
| Cloud sync                      | ✅             | ❌           | ❌        | 🔲 Phase 3                  |
| Workspace indexing              | ✅             | ✅           | partial   | 🔲 Phase 4                  |
| Tests + CI/CD                   | ✅             | ✅           | ✅        | 🔲 Phases 5-6               |
| Inline completions (ghost text) | ✅             | ✅           | ❌        | 🔲 Phase 7                  |
| Agent mode (multi-step)         | ✅             | ✅           | ✅        | 🔲 Phase 8                  |
| Terminal integration            | ✅             | ✅           | ✅        | 🔲 Phase 8                  |
| MCP tool integration            | ✅ (1.99+)     | ✅           | ✅        | 🔲 Phase 9                  |
| Desktop agent bridge            | ❌             | ❌           | ❌        | 🌟 Phase 9 (UNIQUE)         |
| Voice input                     | ❌             | ❌           | ❌        | 🌟 Future (UNIQUE)          |
| Hover AI explanations           | ❌             | ❌           | ❌        | 🔲 Phase 2 (differentiator) |

**Install counts (late 2025)**: Copilot 20M+, Continue 2M+, Cline 1.5M+, Roo Code 900K+

---

## File Count Summary

| Phase                    |  Files | Type                | Release |
| ------------------------ | -----: | ------------------- | ------- |
| 0: Scaffold (done)       |      8 | TypeScript/JS/JSON  | v0.1.0  |
| 1: Polish + Bug Fixes    |      5 | Media + TS + MD     | v0.1.0  |
| 2: Code Intelligence     |      4 | TS providers        | v0.2.0  |
| 3: Conversation History  |      5 | TS storage + UI     | v0.2.0  |
| 4: Workspace Context     |      3 | TS services         | v0.2.0  |
| 5: Tests                 |      6 | TS test files       | v1.0.0  |
| 6: CI/CD + Marketplace   |      4 | YAML + JSON + MD    | v1.0.0  |
| 7: Inline Completions    |      2 | TS providers        | v1.1.0  |
| 8: Agent Mode + Terminal |      5 | TS agent + services | v1.2.0  |
| 9: MCP + Desktop Bridge  |      3 | TS MCP client       | v2.0.0  |
| **Total**                | **45** |                     |         |

Also publish to **Open VSX Registry** (for VSCodium users) alongside VS Code Marketplace using `ovsx publish`.

---

## Quick Start for Developers

```bash
# Navigate to extension
cd apps/extension-vscode

# Install extension-local deps (esbuild, vsce, etc.)
pnpm install

# Build (development)
node esbuild.js

# Build (production VSIX)
node esbuild.js --production && vsce package --no-dependencies

# TypeScript type check
pnpm typecheck

# Watch mode during development
node esbuild.js --watch
```

### Debugging in VS Code

1. Open `apps/extension-vscode/` as the workspace root in VS Code
2. Press `F5` → "Run Extension" → opens Extension Development Host
3. In the new VS Code window, type `@agi` in the Chat panel

---

## Critical Missing Asset: Icons

The extension **will not package or publish** without these files:

- `apps/extension-vscode/media/icon.png` — 128×128 px, AGI Workforce logo
- `apps/extension-vscode/media/icon-sidebar.svg` — 24×24 px monochrome SVG
- `apps/extension-vscode/media/icon-chat.png` — 16×16 px chat avatar

These need to be created or copied from the desktop app's asset library.
Check `apps/desktop/src/assets/` or `apps/desktop/public/` for existing brand icons.
