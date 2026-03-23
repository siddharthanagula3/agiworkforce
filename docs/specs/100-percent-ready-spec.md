# Specification: 100% Demo-Ready — 23-Agent Coordination Spec

Generated: 2026-03-22T23:00:00Z

## Task Overview

Fix every blocker across all surfaces to bring the product from ~40% to 100% demo-ready state. 7 phases covering: web chat fix, 10 P0 bugs, desktop polish, mobile readiness, CLI distribution, Ollama integration, and security review. Executed by 23 specialized parallel agents with strict file ownership and interface contracts to prevent merge conflicts.

---

## Team Composition (23 Agents)

| #   | Agent ID                       | Model  | Phases       | Summary                                                   |
| --- | ------------------------------ | ------ | ------------ | --------------------------------------------------------- |
| 1   | `rust-tauri-engineer`          | opus   | 2C           | Implement phantom Tauri commands, register in lib.rs      |
| 2   | `frontend-engineer`            | sonnet | 1A, 3A, 3C   | Web mode rendering guards, wire buttons, error boundaries |
| 3   | `billing-stripe-engineer`      | sonnet | 2B           | Fix $100 default, validate amount_cents                   |
| 4   | `security-auditor`             | opus   | 2D, 7A       | Sandbox default fix, full security audit                  |
| 5   | `shared-types-guardian`        | sonnet | 2E           | Unify Provider type in packages/types                     |
| 6   | `llm-router-engineer`          | opus   | 2F, 6B       | Model fallback, Ollama Cloud provider                     |
| 7   | `database-engineer`            | sonnet | 2G           | Heartbeat audit column fix                                |
| 8   | `agent-runtime-engineer`       | opus   | 1A (runtime) | TauriRuntime conditional, web mode runtime stub           |
| 9   | `browser-extension-engineer`   | sonnet | 3 (ext)      | Browser extension native host packaging                   |
| 10  | `mcp-integration-engineer`     | sonnet | 6C           | Ollama manifest + docs                                    |
| 11  | `memory-embeddings-engineer`   | opus   | 2A           | chatStore persistence via persist() middleware            |
| 12  | `devops-build-engineer`        | haiku  | 5A           | GitHub Actions CI/CD for CLI releases                     |
| 13  | `documentation-sync-agent`     | haiku  | post-all     | Update CLAUDE.md, AGENTS.md with changes                  |
| 14  | `computer-use-vision-engineer` | opus   | 1B           | Verify web auth flow end-to-end via browser               |
| 15  | `speech-audio-engineer`        | sonnet | 3 (voice)    | Verify voice features degrade gracefully in web mode      |
| 16  | `test-writer`                  | sonnet | post-all     | Write tests for all P0 fixes                              |
| 17  | `code-cleanup-refactor`        | sonnet | 2H           | Settings web-aware persistence                            |
| 18  | `integration-reviewer`         | opus   | 7B           | Cross-surface type + build verification                   |
| 19  | `research-orchestrator-fix`    | opus   | 6A           | Ollama CLI setup subcommand                               |
| 20  | `team-lead-orchestrator`       | opus   | all          | Coordinate all agents, resolve conflicts                  |
| 21  | `spec-handoff-writer`          | opus   | pre-all      | This spec (already complete)                              |
| 22  | `progress-state-tracker`       | haiku  | all          | Track progress across all agents                          |
| 23  | `git-branch-manager`           | sonnet | all          | Manage branches for parallel work                         |

---

## Dependency Graph (Execution Order)

```
Phase 0 (ALREADY DONE):
  spec-handoff-writer produces this spec

Phase 1 (PARALLEL — start immediately):
  1A: frontend-engineer + agent-runtime-engineer  (web mode rendering)
  1B: computer-use-vision-engineer                (web auth verification)
  1C: (ALREADY DONE — vite.config.ts aliases exist)

Phase 2 (PARALLEL — start immediately, no Phase 1 deps):
  2A: memory-embeddings-engineer   (chatStore persist)
  2B: billing-stripe-engineer      (credit-topup validation)
  2C: rust-tauri-engineer          (phantom commands)
  2D: security-auditor             (sandbox default)
  2E: shared-types-guardian        (Provider unification)   ← BLOCKS 2F
  2F: llm-router-engineer          (model fallback)         ← WAITS for 2E
  2G: database-engineer            (heartbeat column)
  2H: code-cleanup-refactor        (settings web-aware)

Phase 3 (PARALLEL — start immediately):
  3A: frontend-engineer            (wire buttons — after 1A)
  3C: frontend-engineer            (error boundaries)
  browser-extension-engineer       (native host)
  speech-audio-engineer            (voice degradation)

Phase 5 (PARALLEL — start immediately, no deps):
  5A: devops-build-engineer        (GitHub Actions)

Phase 6 (PARALLEL — 6A/6C start immediately, 6B waits for 2E):
  6A: research-orchestrator-fix    (ollama CLI subcommand)
  6B: llm-router-engineer          (Ollama Cloud — after 2E)
  6C: mcp-integration-engineer     (ollama manifest + docs)

Phase 7 (SEQUENTIAL — after all others complete):
  7A: security-auditor             (full audit — after 2D)
  7B: integration-reviewer         (cross-surface verify)

Post-Completion:
  test-writer                      (after all code agents finish)
  documentation-sync-agent         (after all code agents finish)
```

### Critical Path

```
shared-types-guardian (2E: Provider type)
  --> llm-router-engineer (2F: model fallback + 6B: Ollama Cloud)
  --> integration-reviewer (7B: verify)
  --> documentation-sync-agent (update docs)
```

The `shared-types-guardian` must complete FIRST because both the `llm-router-engineer` and any agent importing `Provider` needs the canonical type to be finalized.

---

## File Allocation (Exclusive Ownership)

### Agent 1: `rust-tauri-engineer`

**Allowed Files:**

- `apps/desktop/src-tauri/src/sys/commands/chat/conversation.rs`
- `apps/desktop/src-tauri/src/lib.rs` (ONLY the `invoke_handler` block — append new commands)

**Current State:**

- `conversation.rs` has `chat_create_conversation`, `chat_get_conversations`, `chat_get_conversation`, `chat_update_conversation` (takes `UpdateConversationRequest`), `chat_delete_conversation`, `chat_create_message`, `chat_get_messages`.
- There is NO `chat_archive_conversation` command.
- There is NO `chat_update_conversation_title` command (the existing `chat_update_conversation` takes a full `UpdateConversationRequest`, not a standalone title update).
- The plan references two phantom commands; verify if the frontend invokes these by name before implementing.

**Will Produce:**

- `#[tauri::command] pub fn chat_archive_conversation(db: State<'_, AppDatabase>, id: i64, user_id: String) -> Result<(), String>`
- `#[tauri::command] pub fn chat_update_conversation_title(db: State<'_, AppDatabase>, id: i64, user_id: String, title: String) -> Result<(), String>`
- Two new entries in `lib.rs` `invoke_handler![]` macro

**IMPORTANT:** The `lib.rs` invoke_handler starts at line 1038. Only append to the existing comma-separated list. Do NOT reorder or remove any existing commands.

---

### Agent 2: `frontend-engineer`

**Allowed Files:**

- `apps/desktop/src/App.tsx` (ONLY the `useDeepLink()` guard, MCP bundle guard, and `initModels` fallback sections)
- `packages/chat/src/components/ChatInput.tsx`
- `packages/chat/src/components/Sidebar.tsx`
- `packages/chat/src/components/UserProfile.tsx`
- `packages/chat/src/components/ChatInterface.tsx` (add ErrorBoundary wrapping)

**Current State:**

- `App.tsx`: `useDeepLink()` is called unconditionally at line 98 inside `DesktopShell`. The `initializeMcpbInstallListener` import at line 284 is NOT guarded by `isTauri`.
- `ChatInput.tsx`: Has `onPlusClick` prop but it is assigned to `_onPlusClick` (unused — line 28). The file picker ref exists (`fileInputRef`) but the `+` button click handler needs to trigger `fileInputRef.current?.click()`.
- `Sidebar.tsx`: Nav items call `setActiveView()` correctly. The `New Chat` button works. Verify all nav items dispatch correct actions.
- `UserProfile.tsx`: Menu items render Settings, Help, Plans, Apps, Shortcuts, Logout icons. Each calls `openSettings()` or is a no-op. Wire remaining no-op menu items.

**Will Produce:**

- Guard `useDeepLink()` with `if (isTauri)` — use conditional hook pattern or move inside `useEffect`
- Guard MCP bundle init with `if (isTauri)` check
- Wire `+` button to file picker in ChatInput
- Wire all UserProfile menu items to correct actions
- Wrap major sections in `<ErrorBoundary>` component (already exists at `apps/desktop/src/components/ErrorHandling/ErrorBoundary.tsx`)

---

### Agent 3: `billing-stripe-engineer`

**Allowed Files:**

- `apps/web/app/api/credit-topup/route.ts`

**Current State:**

- Lines 62-64: The code defaults `creditAmount` to 10000 (i.e. $100) when `amount_cents` is missing or invalid: `const creditAmount = typeof amount_cents === 'number' && Number.isFinite(amount_cents) ? amount_cents : 10000;`
- Lines 67-69: Validation for range ($10-$1000) exists but only fires AFTER the default is applied.

**Will Produce:**

- Remove the `10000` fallback. If `amount_cents` is missing, undefined, or not a valid number, return a 400 error immediately.
- New logic: validate `amount_cents` exists, is a number, is an integer, and is in the 1000-100000 range. Reject otherwise.

---

### Agent 4: `security-auditor`

**Allowed Files:**

- `crates/sandbox-policy/src/lib.rs`
- READ-ONLY access to all other files for audit purposes

**Current State:**

- `from_mode_str()` (line 14-23): The catch-all `_ => Self::DangerFullAccess` gives full access for ANY unrecognized mode string. This is a security vulnerability.
- The `Default` impl (line 50-55) correctly defaults to `WorkspaceWrite`.
- Tests at line 85-88 assert that `"unknown"` maps to `DangerFullAccess` -- this test must be updated too.

**Will Produce:**

- Change `_ => Self::DangerFullAccess` to `_ => Self::ReadOnly` (safe default)
- Add `tracing::warn!("Unknown sandbox mode '{}', defaulting to ReadOnly", value)` log
- Update test at line 85-88 to expect `ReadOnly` for unknown modes
- Security audit report covering: shell command safety, API key handling, CSRF tokens, unwrap() in production code

---

### Agent 5: `shared-types-guardian`

**Allowed Files:**

- `packages/types/src/provider.ts` (NEW FILE)
- `packages/types/src/index.ts` (add export line)
- `packages/types/src/model-catalog.ts` (ONLY if needed to re-export Provider)

**Current State:**

- `packages/types/src/model-catalog.ts` lines 22-46 define `Provider` type with 24 providers.
- `apps/desktop/src/types/provider.ts` defines an IDENTICAL `Provider` type (25 lines, same 24 providers).
- `apps/desktop/src/stores/settingsStore.ts` line 27 imports `Provider` from `'../types/provider'` (local copy).
- Both types are already in sync (identical), but the desktop has a local duplicate.

**Will Produce:**

- Create `packages/types/src/provider.ts` that re-exports `Provider` from `model-catalog.ts` (single source of truth)
- Add `export * from './provider';` to `packages/types/src/index.ts`
- This agent MUST NOT modify any files in `apps/desktop/` -- that is the `code-cleanup-refactor` agent's job to update imports.

**CONSTRAINT:** The `Provider` type MUST remain identical to the existing definition in `model-catalog.ts` lines 22-46. No additions or removals without explicit approval. The canonical list is:

```typescript
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'zhipu'
  | 'managed_cloud'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'deepinfra'
  | 'nvidia_nim'
  | 'open_router'
  | 'cohere'
  | 'ai21'
  | 'sambanova'
  | 'azure'
  | 'bedrock';
```

---

### Agent 6: `llm-router-engineer`

**Allowed Files:**

- `apps/desktop/src/App.tsx` (ONLY the `initModels()` function, lines 446-498)
- `apps/desktop/src-tauri/src/core/llm/` (new or existing files for Ollama Cloud provider)

**Current State:**

- `App.tsx` lines 446-498: `initModels()` calls `invoke<RustModelInfo[]>('llm_get_available_models')`. The catch block on line 493 is empty -- it silently swallows model loading failures.
- No fallback model list exists for web mode.

**Will Produce:**

- In the catch block (line 493): Add fallback model list (Claude Haiku, GPT-4o Mini) and show toast error
- In web mode (`!isTauri`): Fetch models from cloud API instead of invoke
- Ollama Cloud provider: Add `OllamaCloud` variant in Rust LLM router using `ollama.com/v1` endpoint

**DEPENDS ON:** Agent 5 (`shared-types-guardian`) completing Provider type unification.

---

### Agent 7: `database-engineer`

**Allowed Files:**

- `apps/mobile/services/heartbeat.ts`

**Current State:**

- Line 33: Heartbeat upsert uses `surface_id: 'mobile'` -- the column in `surface_heartbeats` table is `surface` (not `surface_id`), based on the `onConflict: 'user_id,surface_id'` at line 36 which also references `surface_id`.
- Line 90: Audit event insert uses `surface_id: event.surface` -- the column in `surface_activity_log` is `surface` (not `surface_id`).
- Both issues are speculative until DB schema is verified. The plan says to fix `surface_id` -> `surface` on line 90, but the heartbeat also uses `surface_id` on line 33.

**Will Produce:**

- Investigate actual Supabase table schema for `surface_heartbeats` and `surface_activity_log`
- Fix column name mismatches in both heartbeat upsert (line 33) and audit insert (line 90)
- Fix `onConflict` value at line 36 to match actual unique constraint

---

### Agent 8: `agent-runtime-engineer`

**Allowed Files:**

- `apps/desktop/src/runtime/` (entire directory -- currently DOES NOT EXIST, needs creation)
- `apps/web/app/chat/WebRuntime.ts` (currently DOES NOT EXIST, needs creation)

**Current State:**

- `TauriRuntime` is imported at `apps/desktop/src/App.tsx` line 10: `import { TauriRuntime } from './runtime/TauriRuntime'`. However, the `apps/desktop/src/runtime/` directory does NOT exist on disk. This is an untracked new directory per git status.
- `apps/web/app/chat/WebRuntime.ts` does NOT exist. Also untracked.
- The `ChatInterface` component (from `@agiworkforce/chat`) expects a `runtime: ChatRuntime` prop. The `ChatRuntime` interface is referenced in `packages/chat/src/lib/runtime` but the `packages/chat/src/lib/` directory appears empty on disk (no files found by glob).

**Will Produce:**

- `apps/desktop/src/runtime/TauriRuntime.ts` -- implements `ChatRuntime` interface using Tauri `invoke()` for all chat operations
- Ensure `ChatRuntime` interface exists in `packages/chat` (may need to create `packages/chat/src/lib/runtime.ts`)
- A null-safe web runtime stub that returns sensible defaults when Tauri is not available

**IMPORTANT:** The `ChatInterface` component at line 24 throws if runtime is null: `if (!ctx) throw new Error('useRuntime must be used inside <ChatInterface>')`. The runtime MUST be non-null. For web mode, provide a `WebRuntime` that makes HTTP calls to the API gateway instead of Tauri invoke.

---

### Agent 9: `browser-extension-engineer`

**Allowed Files:**

- `apps/extension/` (any files)

**Current State:** Not investigated in detail for this spec. Agent should read the extension directory contents independently.

**Will Produce:**

- Native messaging host packaging for `com.agiworkforce.browser`
- Installation script for the native host manifest

---

### Agent 10: `mcp-integration-engineer`

**Allowed Files:**

- `ollama-manifest.json` (NEW file at repo root)
- `docs/integrations/ollama.md` (NEW file)

**Current State:** Neither file exists.

**Will Produce:**

- `ollama-manifest.json` describing the Ollama integration (model discovery, health check, provider config)
- `docs/integrations/ollama.md` integration guide

---

### Agent 11: `memory-embeddings-engineer`

**Allowed Files:**

- `packages/chat/src/stores/chatStore.ts`

**Current State:**

- The store uses `create<ChatState>()(immer(...))` without `persist()`. Lines 37-156.
- Store manages `conversations`, `messages`, `currentConversationId`, streaming state, search, and draft content.
- No persistence middleware is applied -- all state is lost on page refresh.

**Will Produce:**

- Wrap `immer()` with `persist()` middleware: `create<ChatState>()(persist(immer(...), { name: 'agiworkforce-chat-storage', version: 1 }))`
- Add `partialize` to exclude transient state: `isStreaming`, `streamingContent`, `streamingReasoning`, `searchResults`
- Use `createJSONStorage(() => localStorage)` for cross-environment compatibility

---

### Agent 12: `devops-build-engineer`

**Allowed Files:**

- `.github/workflows/cli-release.yml` (NEW file)

**Current State:**

- Existing workflows: `ci.yml`, `release.yml`, `release-desktop.yml`, `build-windows-release.yml`, `deploy-signaling-server.yml`, `e2e-tests.yml`, `codeql.yml`, `agiworkforce-bot.yml`
- No CLI-specific release workflow exists
- CLI crate: `apps/cli/` with `Cargo.toml` package name `agiworkforce-cli`, binary name `agiworkforce`

**Will Produce:**

- `.github/workflows/cli-release.yml` with:
  - Triggers: tag push matching `cli-v*`
  - Matrix: darwin-x64, darwin-arm64, linux-x64, linux-arm64, windows-x64
  - Steps: checkout, install Rust toolchain, cross-compile, create GitHub release with binaries
  - Artifact naming: `agiworkforce-{os}-{arch}` (tar.gz for unix, zip for windows)

---

### Agent 13: `documentation-sync-agent`

**Allowed Files:**

- `CLAUDE.md` (update build status, codebase metrics)
- `.codex/AGENTS.md`

**Current State:** Both files are already modified (per git status). This agent runs AFTER all other agents complete.

**Will Produce:**

- Updated metrics in CLAUDE.md reflecting changes from this sprint
- Updated agent descriptions in AGENTS.md

---

### Agent 14: `computer-use-vision-engineer`

**Allowed Files:** NONE (read-only verification agent)

**Current State:** Web auth flow: login at `agiworkforce.com/login` -> redirect to `/chat#tokens` -> SPA reads hash tokens via `initializeWebAuth` -> `setSession` -> chat UI renders.

**Will Produce:**

- End-to-end verification report of the web auth flow
- Screenshots or logs of any failures
- Bug reports filed to the appropriate agent if issues found

---

### Agent 15: `speech-audio-engineer`

**Allowed Files:**

- `apps/desktop/src/components/Voice/` (any files, read + minor guards)
- `apps/desktop/src/hooks/useVoiceHotkey.ts` (add isTauri guard if needed)

**Current State:** Voice features use Tauri commands (`invoke('speech_*')`). In web mode these would throw.

**Will Produce:**

- Guard all voice invoke calls with `if (isTauri)` checks
- Ensure voice button gracefully hides or disables in web mode

---

### Agent 16: `test-writer`

**Allowed Files:**

- `apps/desktop/src/__tests__/` (new test files only)
- `apps/web/app/__tests__/` (new test files only)
- `apps/mobile/__tests__/` (new test files only)
- `packages/chat/src/__tests__/` (new test files only)

**Current State:** Existing test suites in all surfaces.

**Will Produce:**

- Tests for each P0 fix (2A-2H)
- Tests for Phase 1 web mode rendering
- Tests must use the project's existing patterns: Vitest for desktop/web, Jest for mobile

**DEPENDS ON:** All code agents completing their work first.

---

### Agent 17: `code-cleanup-refactor`

**Allowed Files:**

- `apps/desktop/src/stores/settingsStore.ts`

**Current State:**

- Line 27: imports `Provider` from `'../types/provider'` (local copy)
- The store uses `persist()` middleware (lines 1-19 of file show it wrapping the store)
- `partialize` function exists but is not env-aware (does not skip desktop-only prefs in web mode)

**Will Produce:**

- Update `Provider` import to use `@agiworkforce/types` once Agent 5 completes
- Make `partialize` env-aware: check `isTauri` and skip desktop-only prefs (windowPreferences, dockOnStartup, etc.) in web mode
- Ensure settings persist correctly across desktop and web environments

**DEPENDS ON:** Agent 5 (`shared-types-guardian`) completing Provider type unification.

---

### Agent 18: `integration-reviewer`

**Allowed Files:** NONE (read-only verification agent)

**Will Produce:**

- Cross-surface type compatibility report
- Shared package version consistency check
- Build pipeline verification (run `cargo check`, `pnpm typecheck:all`, `pnpm lint`)
- Final integration test report

**DEPENDS ON:** All other agents completing.

---

### Agent 19: `research-orchestrator-fix`

**Allowed Files:**

- `apps/cli/src/main.rs` (add `OllamaSetup` subcommand variant)
- `apps/cli/src/config.rs` (add `--ollama-host` flag handling)

**Current State:**

- `main.rs` has `Command` enum with subcommands starting at around line 80
- No `ollama-setup` subcommand exists
- No `--ollama-host` CLI flag exists
- The CLI uses `from_mode_str` from `sandbox-policy` crate but does NOT call it with unknown strings currently (only used in `sandbox::SandboxPolicy::default()`)

**Will Produce:**

- New `OllamaSetup` variant in the `Command` enum
- Implementation: detect Ollama installation, verify API connectivity, list available models, write config to `~/.agiworkforce/config.toml`
- `--ollama-host` flag on the main `Cli` struct (default: `http://localhost:11434`)

---

### Agents 20-23: Coordination Agents

These agents do NOT modify code files directly.

| Agent                    | Role                                                            |
| ------------------------ | --------------------------------------------------------------- |
| `team-lead-orchestrator` | Resolves conflicts, unblocks agents, approves interface changes |
| `spec-handoff-writer`    | This spec (complete)                                            |
| `progress-state-tracker` | Maintains progress board, notifies on completions               |
| `git-branch-manager`     | Creates feature branches, manages merges                        |

---

## Interface Contracts

### Contract 1: `shared-types-guardian` --> ALL TypeScript agents

**Type:** `Provider` (re-exported from `packages/types`)
**Location:** `packages/types/src/provider.ts` re-exporting from `packages/types/src/model-catalog.ts`
**Canonical definition (24 providers, DO NOT MODIFY):**

```typescript
export type Provider =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'ollama'
  | 'xai'
  | 'deepseek'
  | 'qwen'
  | 'moonshot'
  | 'perplexity'
  | 'zhipu'
  | 'managed_cloud'
  | 'mistral'
  | 'groq'
  | 'together'
  | 'fireworks'
  | 'cerebras'
  | 'deepinfra'
  | 'nvidia_nim'
  | 'open_router'
  | 'cohere'
  | 'ai21'
  | 'sambanova'
  | 'azure'
  | 'bedrock';
```

**Consumers:** `code-cleanup-refactor` (settingsStore), `llm-router-engineer` (model fallback)

### Contract 2: `agent-runtime-engineer` --> `frontend-engineer`

**Type:** `ChatRuntime` interface
**Location:** `packages/chat/src/lib/runtime.ts` (must be created or verified)
**Shape (inferred from ChatInterface usage):**

```typescript
export interface ChatRuntime {
  sendMessage(conversationId: string, content: string, options?: SendOptions): Promise<void>;
  getModels(): Promise<ModelInfo[]>;
  createConversation(title: string): Promise<string>;
  deleteConversation(id: string): Promise<void>;
  // ... additional methods TBD by agent-runtime-engineer
}
```

**Constraint:** The `ChatInterface` component at `packages/chat/src/components/ChatInterface.tsx` line 24 throws if runtime is null. Any runtime implementation MUST satisfy the full interface.

### Contract 3: `rust-tauri-engineer` --> `frontend-engineer`

**New Tauri Commands:**

```
chat_archive_conversation(id: i64, user_id: String) -> Result<(), String>
chat_update_conversation_title(id: i64, user_id: String, title: String) -> Result<(), String>
```

**IPC Rules:**

- TypeScript invoke: `invoke('chat_archive_conversation', { id, userId })` (camelCase params)
- Rust handler: `fn chat_archive_conversation(id: i64, user_id: String)` (snake_case params)

### Contract 4: `memory-embeddings-engineer` --> `frontend-engineer`

**Store Contract:** `useChatStore` from `packages/chat/src/stores/chatStore.ts`
**Change:** Adding `persist()` middleware. The store's public API (all action names and state shape) MUST remain identical. Only the middleware wrapping changes.
**Excluded from persistence (via partialize):**

- `isStreaming`
- `streamingContent`
- `streamingReasoning`
- `searchResults`

### Contract 5: `security-auditor` --> `research-orchestrator-fix`

**Shared Crate:** `crates/sandbox-policy/src/lib.rs`
**Change:** `from_mode_str()` unknown mode default changes from `DangerFullAccess` to `ReadOnly`.
**Impact:** The CLI uses `SandboxPolicy::default()` (which is `WorkspaceWrite`) -- this is unaffected. But any CLI code that calls `from_mode_str()` with user input will now get `ReadOnly` instead of `DangerFullAccess` for unknown values.

---

## Shared Types That Multiple Agents Touch

### 1. `Provider` type

- **Source of truth:** `packages/types/src/model-catalog.ts` lines 22-46
- **Duplicate:** `apps/desktop/src/types/provider.ts` (identical, to be deprecated)
- **Touched by:** `shared-types-guardian` (canonicalize), `code-cleanup-refactor` (update imports), `llm-router-engineer` (consume)
- **Rule:** Only `shared-types-guardian` may modify the type definition. Others only update import paths.

### 2. `ChatRuntime` interface

- **Source of truth:** `packages/chat/src/lib/runtime.ts` (to be created/verified)
- **Touched by:** `agent-runtime-engineer` (define), `frontend-engineer` (consume), `llm-router-engineer` (web runtime)
- **Rule:** Only `agent-runtime-engineer` may modify the interface definition.

### 3. `SandboxPolicy` enum

- **Source of truth:** `crates/sandbox-policy/src/lib.rs`
- **Touched by:** `security-auditor` (fix default), `research-orchestrator-fix` (consume via CLI)
- **Rule:** Only `security-auditor` may modify the crate. `research-orchestrator-fix` uses it read-only.

### 4. `chatStore` state shape

- **Source of truth:** `packages/chat/src/stores/chatStore.ts`
- **Touched by:** `memory-embeddings-engineer` (add persist), `frontend-engineer` (consume)
- **Rule:** Only `memory-embeddings-engineer` may modify this file. State shape (field names, types) MUST NOT change.

### 5. `lib.rs` invoke_handler

- **Source of truth:** `apps/desktop/src-tauri/src/lib.rs` starting at line 1038
- **Touched by:** `rust-tauri-engineer` (append commands)
- **Rule:** ONLY `rust-tauri-engineer` may modify this file. Only APPEND to the handler list. Never reorder or remove.

---

## DO NOT TOUCH Sections

### Critical Files -- No Agent Should Modify

| File                                              | Reason                                                                                      |
| ------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `apps/desktop/src-tauri/src/main.rs`              | Entry point. Modifications break the build.                                                 |
| `apps/desktop/src-tauri/Cargo.toml`               | Dependency manifest. Only modify if adding a new crate dep (requires team-lead approval).   |
| `Cargo.toml` (root)                               | Workspace manifest. Only modify for new crate additions.                                    |
| `pnpm-lock.yaml`                                  | Auto-generated. Will be regenerated after `pnpm install`.                                   |
| `packages/types/src/model-catalog.ts` lines 22-46 | Canonical Provider type. Only `shared-types-guardian` may touch, and only to add re-export. |
| `apps/desktop/vite.config.ts`                     | Already has correct web aliases (lines 33-49). No modifications needed.                     |
| `apps/web/vercel.json`                            | Deployment config. Already configured correctly.                                            |
| `apps/desktop/dist-web/`                          | Build output. Auto-generated. Never commit manually.                                        |
| `.env*` files                                     | Secrets. Never commit. Never read in agent code.                                            |

### Code Sections -- No Agent Should Modify

| File                                | Lines                | Reason                                                                |
| ----------------------------------- | -------------------- | --------------------------------------------------------------------- |
| `apps/desktop/src/App.tsx`          | 1-50 (imports)       | Multiple agents touch this file. Only modify your assigned sections.  |
| `apps/desktop/src/App.tsx`          | 273-292 (MCP init)   | `frontend-engineer` may ONLY add an `isTauri` guard, not restructure. |
| `apps/desktop/src-tauri/src/lib.rs` | 1-1037               | State initialization, plugin setup. Do not modify.                    |
| `packages/types/src/index.ts`       | All existing exports | Only APPEND new exports. Never remove or reorder.                     |

---

## Merge Conflict Prevention Rules

### Rule 1: Single Owner Per File

Every file has exactly ONE agent owner. If two agents need to modify the same file, they must coordinate through the `team-lead-orchestrator`. The ownership matrix above is authoritative.

### Rule 2: Append-Only for Shared Files

Files touched by multiple agents (e.g., `lib.rs` invoke_handler, `packages/types/src/index.ts`) follow append-only semantics. Never reorder, remove, or restructure existing content.

### Rule 3: Feature Branches

Each agent works on a dedicated feature branch:

```
100pct/<agent-id>
```

Examples:

- `100pct/rust-tauri-engineer`
- `100pct/frontend-engineer`
- `100pct/billing-stripe-engineer`

The `git-branch-manager` creates all branches from the same base commit on `mobile-restructure`.

### Rule 4: Import Path Convention

When Agent 5 creates the unified Provider type:

- New import path: `import type { Provider } from '@agiworkforce/types';`
- Old import path: `import type { Provider } from '../types/provider';`
- ONLY `code-cleanup-refactor` (Agent 17) updates import paths in desktop files.
- ONLY `shared-types-guardian` (Agent 5) creates the new type file.

### Rule 5: Merge Order

Branches must be merged in this order to avoid conflicts:

1. `shared-types-guardian` (Provider type -- foundational)
2. `security-auditor` (sandbox-policy crate -- no TS deps)
3. `memory-embeddings-engineer` (chatStore -- no deps on others)
4. `rust-tauri-engineer` (Rust commands -- no TS deps)
5. `billing-stripe-engineer` (isolated web file)
6. `database-engineer` (isolated mobile file)
7. `agent-runtime-engineer` (runtime -- consumed by others)
8. `frontend-engineer` (depends on 1, 3, 4, 7)
9. `llm-router-engineer` (depends on 1, 7)
10. `code-cleanup-refactor` (depends on 1)
11. `research-orchestrator-fix` (depends on 2)
12. `devops-build-engineer` (new file, no conflicts)
13. `mcp-integration-engineer` (new files, no conflicts)
14. `browser-extension-engineer` (isolated directory)
15. `speech-audio-engineer` (isolated component)
16. `test-writer` (new files only)
17. `documentation-sync-agent` (last)

### Rule 6: No Formatting Changes

Do NOT run `prettier` or `eslint --fix` on files you do not own. The pre-commit hook (lint-staged) will handle formatting for your changed files.

### Rule 7: Conflict Escalation

If an agent discovers it needs to modify a file outside its ownership:

1. STOP immediately
2. Notify `team-lead-orchestrator` with the file path and reason
3. Wait for reassignment or coordination instructions

---

## Verification Checklist

Before spawning agents, the team-lead must verify:

- [x] All file paths verified to exist in the codebase (or documented as NEW)
- [x] All interface contracts are type-compatible
- [x] No circular dependencies between agent scopes
- [x] DO NOT TOUCH sections are clearly communicated
- [x] Dependency graph has no deadlocks
- [x] Merge order prevents conflicts
- [x] Phase 1C (Vite aliases) is ALREADY DONE -- `vite.config.ts` lines 33-49 have all Tauri plugin aliases

### Known Issues Discovered During Spec Research

1. **`packages/chat/src/lib/` directory is empty** -- The `ChatRuntime` interface is referenced by `ChatInterface.tsx` but the lib directory has no files on disk. The `agent-runtime-engineer` MUST create this interface definition.

2. **`apps/web/app/chat/` directory does not exist** -- Web chat has been moved to a Vite SPA served as static files at `/chat`. The old chat pages are in `apps/web/app/_chat-deprecated/`. No agent needs to create new files here.

3. **The plan references `chat_archive_conversation` and `chat_update_conversation_title` as phantom commands, but only `chat_update_conversation_title` is truly missing.** The existing `chat_update_conversation` can update titles via `UpdateConversationRequest`. There is no archive command at all. Verify the frontend calls these exact command names before implementing.

4. **Heartbeat column name ambiguity** -- Both the heartbeat upsert (line 33) and audit insert (line 90) in `apps/mobile/services/heartbeat.ts` use `surface_id`. The plan says to fix line 90 but line 33 has the same pattern. The actual Supabase column names need verification.

---

## Summary for Team Lead

- **Agents to spawn:** 23 (16 code agents, 3 verification agents, 4 coordination agents)
- **Parallel wave 1 (immediate):** 14 agents can start simultaneously (1A, 1B, 2A-2E, 2G-2H, 3C, 5A, 6A, 6C, 9, 15)
- **Blocked agents:** 2F/6B wait on 2E (Provider type), 3A waits on 1A, 7A/7B wait on all code agents, test-writer waits on all code agents, documentation waits on all
- **Critical path:** `shared-types-guardian` -> `llm-router-engineer` + `code-cleanup-refactor` -> `integration-reviewer`
- **Key interface contracts:** Provider type (24 variants, frozen), ChatRuntime interface (TBD by agent-runtime-engineer), SandboxPolicy default change (DangerFullAccess -> ReadOnly)
- **DO NOT TOUCH warnings:** `main.rs`, `Cargo.toml`, `vite.config.ts`, `vercel.json`, `pnpm-lock.yaml`
- **Phase 1C is already done:** Vite web aliases for all Tauri plugins already exist in `vite.config.ts`
- **Merge order is strict:** 17-step sequence prevents conflicts
