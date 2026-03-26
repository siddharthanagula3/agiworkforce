# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

AGI Workforce — model-agnostic AI desktop platform. Tauri v2 (Rust + React 19). Multi-LLM routing, desktop autonomy, 150+ non-coding skills, mobile companion.

---

## Project Overview

pnpm monorepo + Cargo workspace. 8 surfaces, ~1.2M LOC (403K Rust, 781K TypeScript).

```
apps/desktop/src-tauri/src/     # Rust backend — 732 files across 8 modules
  core/                         #   LLM router, agents, swarm, MCP, embeddings, scheduler, skills
  sys/                          #   Commands (1,448 Tauri commands), security, billing, diagnostics
  automation/                   #   Screen capture, input simulation, browser, OCR, computer use
  features/                     #   Terminal (PTY), speech (TTS/STT), calendar
  data/                         #   SQLite (SQLCipher), settings service, cache, state
  integrations/                 #   Cloud sync, email (IMAP/SMTP), Git, Stripe
  ui/                           #   System tray, window management, overlay, dock
  models/                       #   Shared Rust structs (not LLM models)

apps/desktop/src/               # React 19 frontend — 1,048 files
  components/                   #   85 component directories (Chat, Settings, Agent, MCP, etc.)
  stores/                       #   84 Zustand stores (chat, auth, mcp, automation, etc.)
  hooks/                        #   39 custom hooks (useVoiceInput, useTerminal, etc.)
  services/                     #   Service layer (LLM, automation, sync)
  lib/                          #   Utilities, tauri-mock, storageFallback
  constants/                    #   models.json (source of truth for LLM model IDs)
  i18n/                         #   12 locales (ar, de, en, es, fr, hi, it, ja, ko, pt, ru, zh)
  types/                        #   App-specific TypeScript types

apps/web/                       # Next.js 16 App Router (Supabase auth, Stripe billing)
apps/mobile/                    # Expo 55 + expo-router (NativeWind, MMKV, SecureStore)
apps/cli/                       # Rust CLI agent — 174 files + TUI (agiworkforce-cli crate)
apps/extension/                 # Chrome MV3 (native messaging, DOM automation)
apps/extension-vscode/          # VS Code (chat participant @agi, agent mode)
packages/api/                   # ~1,061 typed invoke() wrappers (30+ domain modules)
packages/runtime/               # Runtime detection + capability-aware command routing
packages/types/                 # Shared TS types (a2a, cross-device, mcp-apps, audit)
packages/utils/                 # Shared utilities (formatBytes, debounce, sleep, etc.)
packages/stores/                # Shared Zustand stores (cross-app state)
packages/chat/                  # Shared chat components
packages/react-native-worklets/ # React Native Reanimated worklets
crates/sandbox-policy/          # OS-level sandbox (macOS Seatbelt, Linux Bubblewrap/Landlock)
services/api-gateway/           # Express API for mobile + cloud chat SSE
services/signaling-server/      # WebSocket signaling for cross-device streams
```

---

## Tech Stack

| Layer              | Technology                                             | Version                                  |
| ------------------ | ------------------------------------------------------ | ---------------------------------------- |
| Desktop shell      | Tauri                                                  | 2.9.3                                    |
| Rust edition       | Rust                                                   | 2021 (toolchain 1.94.0)                  |
| Frontend framework | React                                                  | 19.2.4                                   |
| Bundler            | Vite                                                   | 7.x (SWC)                                |
| Styling            | Tailwind CSS                                           | 4.x (CSS-first, `@theme` in globals.css) |
| State management   | Zustand                                                | 5.x + Immer + Persist                    |
| UI primitives      | Radix UI                                               | Latest                                   |
| Icons              | Lucide React                                           | Latest                                   |
| Toasts             | Sonner                                                 | Latest                                   |
| Component variants | CVA (class-variance-authority)                         | Latest                                   |
| Web framework      | Next.js                                                | 16 (App Router)                          |
| Mobile framework   | Expo                                                   | 55 + expo-router                         |
| Mobile styling     | NativeWind                                             | Latest                                   |
| Auth               | Supabase SSR                                           | Latest                                   |
| Billing            | Stripe (async-stripe in Rust, @stripe/stripe-js in TS) | Latest                                   |
| Database           | SQLite via rusqlite (SQLCipher encryption)             | 0.39                                     |
| HTTP client        | reqwest (Rust), fetch (TS)                             | 0.12                                     |
| Serialization      | serde + serde_json                                     | 1.0                                      |
| Async runtime      | Tokio (full features)                                  | 1.37                                     |
| Error handling     | anyhow + thiserror                                     | 1.0 / 2.0                                |
| Package manager    | pnpm                                                   | 9.15.3                                   |
| Node.js            | Node                                                   | 22                                       |
| TypeScript         | TypeScript                                             | 5.9.3                                    |
| Test (TS)          | Vitest + jsdom                                         | Latest                                   |
| Test (Rust)        | cargo test + mockall + proptest                        | Latest                                   |
| E2E                | Playwright                                             | 1.58.2                                   |
| Linting (TS)       | ESLint 9 flat config + Prettier                        | Latest                                   |
| Linting (Rust)     | clippy (-D warnings -D unsafe-code)                    | Latest                                   |
| CI                 | GitHub Actions                                         | ci.yml, release.yml, e2e-tests.yml       |

---

## Build Commands

```bash
# -- Install --
pnpm install                                    # All JS dependencies
cargo check                                     # Rust type check (all workspace crates)

# -- Development --
cd apps/desktop && pnpm dev                     # Desktop dev (Vite HMR + Rust rebuild)
cd apps/desktop && pnpm dev:vite                # Frontend-only (no Rust rebuild -- fast)
cd apps/web && pnpm dev                         # Web dev server (Next.js)
cd apps/mobile && pnpm dev                      # Expo dev server
cd apps/cli && cargo run -- "prompt"            # CLI test run

# -- Type Checking --
pnpm typecheck                                  # Desktop workspace only
pnpm typecheck:all                              # All TypeScript workspaces

# -- Linting --
pnpm lint                                       # ESLint (max-warnings=0, excludes extension)
pnpm lint:extension                             # ESLint for Chrome extension only
pnpm format:check                               # Prettier check
pnpm format                                     # Prettier fix
cargo clippy --workspace --lib -- -D warnings -D unsafe-code  # Rust linting (CI-matching)

# -- Testing (only when explicitly asked) --
cd apps/desktop && pnpm test                    # Vitest
cd apps/desktop && pnpm test -- src/__tests__/features.test.ts  # Single test file
cargo test --workspace --lib                    # Rust tests
cargo test -p agiworkforce-cli -- test_name     # Single Rust test
cd apps/desktop && pnpm test:e2e               # Playwright E2E

# -- Building --
pnpm build:all                                  # Build all packages (except desktop)
pnpm build:desktop                              # Tauri production build
cargo check -p agiworkforce-cli                 # CLI crate check only

# -- Workspace Targeting --
pnpm --filter @agiworkforce/desktop <cmd>       # Desktop
pnpm --filter @agiworkforce/web <cmd>           # Web (or: pnpm --filter web <cmd>)
pnpm --filter @agiworkforce/api-gateway <cmd>   # API Gateway
```

---

## Common Pitfalls (READ FIRST)

These are the bugs that waste the most time. Check every one before submitting code.

### 1. Tauri IPC Casing (CRITICAL)

The #1 source of silent bugs. Tauri auto-converts parameter names at the TS-Rust boundary.

| Context                         | Convention | Example                    |
| ------------------------------- | ---------- | -------------------------- |
| TypeScript `invoke()` params    | camelCase  | `modelId`, `chatMessage`   |
| Rust `#[tauri::command]` params | snake_case | `model_id`, `chat_message` |
| Command names (both sides)      | snake_case | `send_message`             |

**Snake_case in TypeScript `invoke()` silently arrives as `undefined` on the Rust side -- NO runtime error.** After writing any `invoke()` call, always verify parameter casing matches the Rust handler.

### 2. Serde Rename

Every Rust struct serialized to/from JSON MUST have `#[serde(rename_all = "camelCase")]`. Missing this causes silent deserialization failures at the IPC boundary -- fields arrive as `null`/`undefined` in TypeScript.

### 3. State Registration Order

Managed state in `lib.rs` setup() is initialized in dependency order (50+ state objects). If State A depends on State B, State B must be `app.manage()`'d first. Getting this wrong causes runtime panics.

### 4. Mutex Deadlocks

Never hold a `std::sync::Mutex` across an `.await` point -- use `tokio::sync::Mutex` for async code. The `await_holding_lock` clippy lint is `allow`'d (legacy), so you must manually audit this.

### 5. useEffect Cleanup

Tauri event listeners (`listen()`) return `Promise<UnlistenFn>`. You MUST await and call the unlisten function in cleanup. Common mistake: forgetting to store the unlisten in a ref.

### 6. Model ID Hardcoding

**NEVER hardcode model IDs.** The canonical source of truth is `apps/desktop/src/constants/models.json`. Model IDs change rapidly across providers. Always read from this file.

### 7. Console.log in Production

`console.log` is stripped by esbuild in production builds. Use `tracing::info!()` in Rust. In TypeScript, use structured logging or toast notifications for user-facing messages.

### 8. Zustand Selector Re-renders

Always use `useShallow` from `zustand/react/shallow` when selecting multiple values. Without it, every store update triggers a re-render even if selected values haven't changed.

---

## Coding Standards

### Rust Conventions

```toml
# From Cargo.toml [lints.rust]
unsafe_code = "deny"
dead_code = "deny"
unused_imports = "deny"
unused_variables = "deny"
unused_mut = "deny"
unused_attributes = "deny"

# [lints.clippy]
await_holding_lock = "allow"
```

- Zero `.unwrap()` on fallible ops outside tests -- use `?` or `.map_err()`
- Zero `#[allow(dead_code)]` -- wire it or delete it
- Prefer `anyhow::Result` for `#[tauri::command]` return types
- `thiserror::Error` for domain error enums (see `sys/error/mod.rs` for `AGIError`)
- Access managed state via `State<'_, T>` -- never global statics
- Use degraded state constructors for optional features: `MemoryState::degraded()`
- All serde structs: `#[serde(rename_all = "camelCase")]` for JSON/TS compatibility
- Feature flags: `default = ["shell", "updater", "billing", "vad"]`
  - Optional: `ocr`, `local-llm`, `local-whisper`, `webrtc-support`, `sentry`, `remote-databases`, `devtools`
  - Guard with `#[cfg(feature = "...")]`

**Canonical Tauri command pattern:**

```rust
use tauri::State;

#[tauri::command]
pub async fn get_settings(
    settings: State<'_, SettingsServiceState>,  // Managed state via State<'_, T>
) -> Result<SettingsResponse, String> {         // String error for IPC
    let svc = settings.lock().await;
    svc.get_all()
        .await
        .map_err(|e| e.to_string())            // Convert anyhow/thiserror to String at boundary
}
```

**State management patterns (4 variants):**

```rust
// Pattern A: Arc<Mutex<T>> -- sync access to shared state
pub struct AppDatabase { conn: Arc<Mutex<rusqlite::Connection>> }

// Pattern B: Arc<RwLock<T>> -- async read-heavy state (multiple readers, single writer)
pub struct LLMState { pub router: Arc<RwLock<LLMRouter>> }

// Pattern C: Arc<TokioMutex<T>> -- async state held across .await points
app.manage(Arc::new(TokioMutex::new(ComputerUseState::new())));

// Pattern D: Wrapper with degradation -- features that may fail to init
pub struct BrowserStateWrapper { state: Result<BrowserState, String> }
impl BrowserStateWrapper {
    pub fn new_degraded(error: String) -> Self { Self { state: Err(error) } }
}
```

**State initialization in setup() -- graceful degradation:**

```rust
match StateType::new(dependencies) {
    Ok(state) => {
        app.manage(state);
        tracing::info!("StateType initialized");
    }
    Err(e) => {
        tracing::warn!("Failed to initialize StateType: {}. Degraded.", e);
        app.manage(StateType::new_degraded());
    }
}
```

**App directory resolution (thread-safe, no env vars):**

```rust
static APP_DATA_DIR: OnceLock<PathBuf> = OnceLock::new();
pub fn set_app_data_dir(path: PathBuf) { let _ = APP_DATA_DIR.set(path); }  // Called once in setup()
pub fn app_data_dir() -> anyhow::Result<PathBuf> {
    APP_DATA_DIR.get().cloned().ok_or_else(|| anyhow::anyhow!("App data dir not set"))
}
```

### TypeScript Conventions

**Compiler strictness** (from `tsconfig.base.json`):

- `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noUncheckedIndexedAccess`
- `noImplicitReturns`, `noImplicitOverride`, `noPropertyAccessFromIndexSignature`
- `useUnknownInCatchVariables: true`, `allowUnreachableCode: false`
- Target: ES2020, Module: ESNext, JSX: react-jsx

**React 19 patterns:**

```tsx
// useActionState for form submission (replaces useFormState)
const [formState, submitAction, isSubmitting] = useActionState<AuthFormState, FormData>(
  async (_prevState, formData) => {
    const email = formData.get('email') as string;
    const result = await signIn(email, password);
    return result.error ? { error: result.error } : { error: null, success: true };
  },
  { error: null, success: false }
);

// useTransition for pending states
const [isPending, startTransition] = useTransition();
const handleSubmit = () => startTransition(async () => { await asyncOp(); });

// Ref-as-prop -- no forwardRef needed (React 19+)
function Button({ ref, ...props }: { ref?: React.Ref<HTMLButtonElement> }) { ... }

// useShallow for store selectors (prevents unnecessary re-renders)
const { a, b } = useStore(useShallow((s) => ({ a: s.a, b: s.b })));
```

**Code style:**

- `interface` over `type` for object shapes. Named exports only -- no `export default`
- Absolute imports: `@/`, `@components/`, `@stores/`, `@hooks/`, `@lib/`, `@utils/`
- `cn()` from `@/lib/utils` for Tailwind class merging (clsx + tailwind-merge)
- Toasts: `import { toast } from 'sonner'` -- NOT `@/hooks/useToast`
- Icons: Lucide React -- NOT heroicons or other libraries
- UI primitives: Radix UI -- NOT headless UI or custom implementations
- Component variants: CVA (`class-variance-authority`) for type-safe variant props
- Store-based navigation -- no React Router `<Route>` in desktop; views managed via Zustand store actions
- `displayName` set on all components (for DevTools debugging)

**Safety:**

- Every `invoke()` call wrapped in try/catch
- Timer/listener cleanup in `useEffect` return. Copy refs to local vars in cleanup
- Never mutate objects -- use spread or Immer `produce()` in Zustand stores
- No `console.log` in production -- esbuild drops them in prod builds
- Validation: Zod schemas at system boundaries (API responses, user input, IPC params)
- Zero `// @ts-ignore` or `as any`

### Prettier Config

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "all",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

### ESLint Config (flat config, `eslint.config.mjs`)

- `@typescript-eslint/no-unused-vars`: error (with `^_` ignore pattern)
- `@typescript-eslint/no-explicit-any`: warn (off for `apps/web/` stubs)
- `react-hooks/rules-of-hooks`: error
- `react-hooks/exhaustive-deps`: warn
- `prefer-const`: warn
- `no-useless-catch`: off
- Max warnings: 0 (enforced in CI)
- Separate configs for: browser extension (chrome globals), Node.js services, test files

---

## Naming Conventions

| Entity                    | Convention                      | Example                                      |
| ------------------------- | ------------------------------- | -------------------------------------------- |
| Rust files                | snake_case                      | `llm_router.rs`, `send_message.rs`           |
| Rust structs/enums        | PascalCase                      | `AGIError`, `LLMConfig`, `McpState`          |
| Rust functions            | snake_case                      | `get_settings`, `send_message`               |
| Rust constants            | SCREAMING_SNAKE                 | `DEFAULT_PORT`                               |
| TS files (components)     | PascalCase                      | `AccountSettings.tsx`                        |
| TS files (stores)         | camelCase + `Store` suffix      | `chatPreferencesStore.ts`                    |
| TS files (hooks)          | camelCase + `use` prefix        | `useVoiceInput.ts`                           |
| TS files (utils/services) | camelCase                       | `storageFallback.ts`                         |
| TS interfaces             | PascalCase, `I` prefix NOT used | `ChatPreferences`, `Message`                 |
| TS types                  | PascalCase                      | `AgentMode`, `RuntimeEnv`                    |
| Zustand stores            | `use___Store`                   | `useChatPreferencesStore`                    |
| React components          | PascalCase, named export        | `export function AccountSettings()`          |
| CSS classes               | Tailwind utilities + `cn()`     | `cn('p-4', isActive && 'bg-blue-500')`       |
| Tauri commands            | snake_case both sides           | `send_message` (TS) -> `send_message` (Rust) |
| Event channels            | `agi:event_name`                | `agi:file_operation`, `agi:tool_execution`   |
| Feature flags             | kebab-case                      | `local-llm`, `webrtc-support`                |
| Commit messages           | `type(scope): lowercase`        | `feat(chat): add voice input`                |

---

## Architecture Deep Dive

### Rust Backend Module Map

| Module                    | Path                       | Purpose                                                    |
| ------------------------- | -------------------------- | ---------------------------------------------------------- |
| `core/llm`                | `core/llm/`                | LLM router (25 providers), SSE streaming, token counting   |
| `core/agent`              | `core/agent/`              | Agent framework, approval controller, tool execution       |
| `core/mcp`                | `core/mcp/`                | MCP client (stdio/SSE/streamable HTTP), tool registry      |
| `core/swarm`              | `core/swarm/`              | Multi-agent swarm orchestration                            |
| `core/embeddings`         | `core/embeddings/`         | Vector embeddings, similarity search                       |
| `core/scheduler`          | `core/scheduler/`          | Cron jobs, event triggers, webhooks                        |
| `core/skills`             | `core/skills/`             | 150+ non-coding skills engine                              |
| `sys/commands`            | `sys/commands/`            | All 1,448 `#[tauri::command]` handlers                     |
| `sys/security`            | `sys/security/`            | AuthManager, SecretManager (Argon2id + AES-GCM), ToolGuard |
| `sys/billing`             | `sys/billing/`             | Stripe integration, credit tracking                        |
| `automation/screen`       | `automation/screen/`       | Screen capture (xcap), annotation                          |
| `automation/input`        | `automation/input/`        | Keyboard/mouse simulation (enigo, rdev)                    |
| `automation/browser`      | `automation/browser/`      | Browser automation, DOM interaction                        |
| `automation/computer_use` | `automation/computer_use/` | Full computer use agent                                    |
| `features/terminal`       | `features/terminal/`       | PTY terminal (portable-pty)                                |
| `features/speech`         | `features/speech/`         | TTS/STT, voice activity detection (WebRTC VAD)             |
| `data/db`                 | `data/db/`                 | SQLite (SQLCipher encrypted), migrations                   |
| `data/settings`           | `data/settings/`           | SettingsService (persisted preferences)                    |

### Database Patterns

All databases use SQLCipher encryption with machine-derived keys:

```rust
// 1. Key derivation from machine identity (not user-facing keyring)
let key = derive_key(KeyPurpose::DatabaseEncryption);
// 2. PRAGMAs for performance
conn.execute_batch("
    PRAGMA busy_timeout = 5000;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    PRAGMA foreign_keys = ON;
    PRAGMA cache_size = -64000;
")?;
// 3. Migrations via embedded SQL in migrations.rs
// 4. Connection wrapping: Arc<Mutex<Connection>> (no r2d2 pool)
```

### LLM Router Internals

**Cost safety (defense-in-depth):**

- Per-task cap: `max_cost_per_task` from AgentConfig (default $5)
- Per-session cap: `SESSION_COST_SAFETY_CAP` = $50

**Retry logic:**

- Retryable: rate limits, timeouts, 5xx errors
- Non-retryable: auth errors (403), billing errors (402), quota exceeded
- Backoff: exponential with 25% jitter, capped at `max_delay_ms`

**Routing decision tree:**

1. Normalize model ID via models.json canonicalization
2. Classify intent (coding, chat, vision) from RouterContext
3. Generate candidate providers ranked by cost/quality/plan
4. Retry with exponential backoff + fallback chain

### Agent Framework

**Task lifecycle:** `Pending -> Planning -> Executing -> WaitingApproval -> Completed`

**Two-tier approval system:**

1. **ApprovalManager** (sync) -- rule-based auto-approval inside AutonomousAgent
   - Dangerous ops (file_delete, shell commands) ALWAYS require approval
   - Check task-level `auto_approve` flag
   - Check rules in order (`AlwaysRequire` short-circuits)
2. **ApprovalController** (async) -- interactive frontend prompt for escalated tasks

### MCP Client Architecture

**Transport abstraction:**

```rust
#[async_trait]
pub trait McpTransport: Send + Sync {
    async fn send_request(&self, method: String, params: Option<Value>) -> McpResult<JsonRpcResponse>;
    fn is_alive(&self) -> bool;
    async fn shutdown(&self) -> McpResult<()>;
}
// Implementations: StdioTransport, SseTransport, HttpTransport
```

**Session lifecycle:** `connect_server() -> initialize() -> list_tools() -> register in sessions map`

**Transport details:**

- Stdio: child process, JSON-RPC over stdin/stdout, cleanup via Drop
- SSE: persistent HTTP, reconnection logic, idle timeout = 30s
- HTTP: request/response, default timeout = 30s
- Augmented PATH for Node.js detection across OS

### Security Architecture

**AuthManager** (`sys/security/auth.rs`):

- Password hashing: Argon2id
- Brute force: 5 failed attempts -> 30 min lockout
- Inactivity timeout: 15 minutes
- Session tokens: HMAC-SHA256
- All comparisons: constant-time (`ct_eq`) to prevent timing side-channels

**SecretManager** (`sys/security/secret_manager.rs`):

- All secrets stored encrypted in SQLite (AES-GCM)
- JWT secrets: auto-generated (64 bytes crypto-random), supports rotation
- Machine-derived keys: deterministic per-machine, no OS keyring prompts

**ToolGuard** (`sys/security/tool_guard.rs`):

- 4 safety tiers: Safe (30/min) -> RequiresNotification -> RequiresConfirmation (10/min) -> RequiresExplicitApproval (5/min)
- Checks in order: rate limit -> path traversal -> command injection -> approval tier
- SecurityError variants: `UnauthorizedTool`, `PathTraversal`, `CommandInjection`, `RateLimitExceeded`, `ApprovalRequired`

### Error Hierarchy (`sys/error/mod.rs`)

```
AGIError (thiserror, serde tagged enum via #[serde(tag = "type", content = "details")])
+-- ToolError (BrowserError, FileSystemError, DatabaseError, ApiError, etc.)
+-- LLMError (RateLimitError, ContextLengthError, ContentFilterError, ProviderError)
+-- ResourceError (MemoryExhausted, CpuBottleneck, Timeout, QuotaExceeded)
+-- PermissionError, TransientError, FatalError, ConfigurationError
+-- TimeoutError, CommandTimeout, Database, Http, Generic, Other
+-- EmailSend, EmailParse
```

Error modules: `categorization.rs` (transient vs fatal vs user-action), `retry.rs` (exponential backoff), `recovery.rs` (recovery strategies), `translator.rs` (user-friendly messages).

**Error propagation:** Use `?` internally, convert to `String` at Tauri IPC boundary. Never expose internal error details to frontend.

### Event System

**Namespace:** All Rust->frontend events use `agi:*` prefix.

**Emission pattern:**

```rust
pub fn emit_file_operation(app_handle: &AppHandle, operation: FileOperation) {
    if let Err(e) = app_handle.emit("agi:file_operation", serde_json::json!({ "operation": operation })) {
        tracing::error!("[Events] Failed to emit: {}", e);
    }
}
```

**Frontend consumption:**

```typescript
useEffect(() => {
  let unlisten: UnlistenFn | null = null;
  const setup = async () => {
    unlisten = await listen<AgentStatusPayload>('agent:status', (payload) => {
      useAgentStore.getState().updateAgentStatus(payload);
    });
  };
  void setup();
  return () => {
    unlisten?.();
  };
}, []);
```

### Frontend Data Flow

```
Rust #[tauri::command] -> invoke() -> packages/api wrappers -> Zustand stores -> React components
                                                                 ^
Rust events (emit) --> listen() -> packages/runtime/events -----+
```

**Zustand canonical middleware stack (order matters):**

```typescript
create<T>()(devtools(persist(subscribeWithSelector(immer((set, get) => ({...}))))))
```

**Store structure:**

```typescript
// Separate state and action interfaces, union them
interface ChatPreferences {
  promptCompletionEnabled: boolean;
}
interface ChatPreferencesActions {
  setPromptCompletionEnabled: (enabled: boolean) => void;
}
export type ChatPreferencesStore = ChatPreferences & ChatPreferencesActions;

// Persist with partialize (exclude transient state), versioned migrations
persist(store, {
  name: 'agiworkforce-chat-preferences',
  version: 2,
  storage: createJSONStorage(() => storageFallback),
  partialize: (state) => ({ chatPreferences: state.chatPreferences }),
  migrate: (state, version) => {
    /* handle schema evolution */
  },
});
```

**Async actions in stores:**

```typescript
setAutoApproveTools: async (enabled: boolean) => {
  set({ autoApproveTools: enabled }); // Optimistic update
  try {
    await invoke('set_auto_approve_all', { enabled });
  } catch (error) {
    toast.error('Failed to sync');
  } // Don't revert -- show error
};
```

### packages/api Pattern

Every Tauri command domain has a typed wrapper in `packages/api/src/`:

```typescript
import { command } from '@agiworkforce/runtime';
export async function getSettings(): Promise<Settings> {
  return command('get_settings');
}
```

- `command()` handles: Tauri invoke (desktop), HTTP fallback (web), throws in test (must mock)
- 30+ domain modules: `chat.ts`, `agent.ts`, `automation.ts`, `mcp.ts`, `settings.ts`, etc.

### packages/runtime -- Capability-Aware Dispatch

| Environment | Detection      | Routing                             |
| ----------- | -------------- | ----------------------------------- |
| Desktop     | `isTauri()`    | Direct `invoke()` via Tauri IPC     |
| Cloud web   | `isCloudWeb()` | HTTP POST to API gateway            |
| Test        | `isTest()`     | Throws (tests must mock explicitly) |

**Capability tiers** (prefix-based classification in `registry.ts`):

- **cloud** -- `chat_`, `llm_`, `skill_`, `analytics_`, `auth_`, `billing_`
- **desktop-preferred** -- `mcp_`, `research_`, `email_`, `calendar_`, `memory_`, `agent_`, `swarm_`
- **desktop-only** -- `browser_`, `file_`, `terminal_`, `git_`, `voice_`, `computer_use_`, `automation_`

Event abstraction: `listen()`, `once()`, `emit()` work identically across environments.

### Component Patterns

```tsx
// CVA variants + Radix Slot for polymorphism
interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  ref?: React.Ref<HTMLButtonElement>;
}

function Button({ className, variant, size, asChild = false, ref, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
}
Button.displayName = 'Button';
export { Button, buttonVariants };
```

### Dialog/Confirm Pattern

```typescript
// Promise-based confirm hook
const { confirm, dialog } = useConfirm();
const confirmed = await confirm({ title: 'Delete?', description: 'Are you sure?' });
if (confirmed) {
  /* proceed */
}
// Render {dialog} in component JSX
```

### Navigation (Store-Based, No React Router)

```tsx
// Views managed entirely via Zustand stores
const mode = useAppModeStore((s) => s.mode); // 'local' | 'cloud'
{
  !isAuthenticated && <AuthPage />;
}
{
  isAuthenticated && mode === 'cloud' && <CloudInterface />;
}
{
  isAuthenticated && mode === 'local' && <DesktopInterface />;
}
```

---

## Tailwind CSS v4 Configuration

Tailwind v4 uses CSS-first config in `apps/desktop/src/styles/globals.css`:

- Import: `@import 'tailwindcss';`
- Theme: `@theme { ... }` block with custom colors, fonts, line-heights
- Custom fonts: FK Grotesk (sans), Berkeley Mono (mono), OpenDyslexic (accessibility)
- Custom color tokens: `cream-*`, `charcoal-*`, `terra-cotta-*`
- No `tailwind.config.js` -- everything is in CSS `@theme` directives
- Vite plugin: `@tailwindcss/vite` (not PostCSS)

---

## Commit Conventions

- Format: `type(scope): lowercase subject` -- max 100 chars
- Subject MUST be lowercase (not Sentence-case or PascalCase)
- Valid types: `feat`, `fix`, `chore`, `docs`, `refactor`, `test`, `perf`, `ci`, `build`, `style`
- Enforced by: Husky pre-commit (lint-staged: ESLint + Prettier), commit-msg (commitlint with `@commitlint/config-conventional`)
- Co-author line required when Claude creates commits

---

## CI Pipeline (GitHub Actions)

### `ci.yml` -- runs on push/PR to main

1. **JS audit** -- `pnpm audit --audit-level=critical` (blocking)
2. **Lint** -- `pnpm lint` (max-warnings=0)
3. **Type check** -- `pnpm typecheck:all`
4. **Test** -- `pnpm test`
5. **Build packages** -- api-gateway, signaling-server, extension, web
6. **Rust audit** -- `cargo audit --deny warnings` (blocking)
7. **Rust test** -- `cargo test --workspace --lib` (skips automation/enigo tests on CI via `xvfb-run`)
8. **Clippy** -- `cargo clippy --workspace --lib -- -D warnings -D unsafe-code`

### Release workflows

- `release-desktop.yml` -- Tauri build + sign (macOS Developer ID, Windows DigiCert SHA256, Linux AppImage)
- `release.yml` -- npm publish, Homebrew formula

---

## Per-App Quick Reference

### Desktop (`apps/desktop/`)

- Tauri v2 + Vite 7 + React 19 + SWC
- Dev URL: `http://127.0.0.1:5173`
- Path aliases: `@/` -> `src/`, `@components/`, `@stores/`, `@hooks/`, `@lib/`
- CSP enforced in both `tauri.conf.json` and Vite dev server headers
- Chunk splitting: react-vendor, ui-vendor, markdown-vendor, monaco-vendor, terminal-vendor, charts-vendor, diagram-vendor, pdf-vendor, virtualization-vendor, utility-vendor, zustand
- i18n: 12 locales via i18next
- Test: Vitest + jsdom, setup in `src/test/setup.ts`

### Web (`apps/web/`)

- Next.js 16 App Router, server components by default
- Auth: Supabase SSR. Billing: Stripe. 47 API routes
- Rate limiting: Upstash Redis (with in-memory fallback). CSRF: HMAC-SHA256, 1-hour TTL
- Hybrid build: desktop Vite SPA (`/chat/`) + Next.js SSR
- Stubs: `apps/web/api/`, `apps/web/stores/unified/` shim desktop-only APIs
- ESLint: `no-explicit-any` off (stub compatibility)
- LLM routing: 75+ models via `lib/llm-providers/factory.ts`

**Web API route pattern:**

```typescript
export async function POST(request: NextRequest): Promise<NextResponse> {
  // 1. CSRF protection (exempt Bearer token requests)
  const csrfError = await requireCsrfToken(request);
  if (csrfError) return csrfError;
  // 2. Authenticate via Supabase (never trust userId from body)
  const {
    data: { user },
  } = await supabase.auth.getUser(token);
  // 3. Validate with Zod
  const input = Schema.parse(await request.json());
  // 4. Business logic + CORS headers in response
}
```

### Mobile (`apps/mobile/`)

- Expo 55 + expo-router. NativeWind styling
- Storage: MMKV (fast, encrypted at rest via OS keychain key) + SecureStore (sensitive)
- Desktop companion: WebRTC data channel + signaling server fallback
- Auth guard: redirect to `/(auth)/login` if no session
- Background fetch for agent status polling

### CLI (`apps/cli/`)

- Binary: `agiworkforce`, crate: `agiworkforce-cli`
- 16 subcommands: exec, review, apply, sandbox, mcp-server, app-server, resume, fork, cloud, plugin, features, execpolicy, ecosystem, sync, login, logout
- TUI: `apps/cli/src/tui/` (121 files, terminal UI)
- Config: `~/.agiworkforce/config.toml`, Sessions: `~/.agiworkforce/sessions.db`
- Plugin system: `~/.agiworkforce/plugins/` with `.app.json`/`.mcp.json` manifests
- OS sandboxing: macOS Seatbelt, Linux Bubblewrap/Landlock
- Dead code lint: warn (not deny) -- intentionally broad API surface
- Core engine: `crates/agiworkforce-core/` (78 internal crates)

### Chrome Extension (`apps/extension/`)

- MV3 service worker (min Chrome 132). ESLint: separate config (`.eslintrc.cjs`)
- 4 Vite entry points: background.ts, content.ts, popup.ts, side_panel.ts
- 60+ discriminated message types (`NativeMessageType` union)
- Native messaging host: `com.agiworkforce.browser`
- Side panel chat via HTTP bridge (localhost:8765)
- WebMCP tool discovery from page DOM + NLWeb detection

### VS Code Extension (`apps/extension-vscode/`)

- Chat participant `@agi` with /explain, /fix, /refactor, /tests, /docs
- 45+ commands, 13 providers (sidebar, agent mode, CodeLens, inline completions, etc.)
- Agent mode: multi-file editing with SEARCH/REPLACE patch engine
- Desktop bridge: WebSocket `ws://127.0.0.1:8787/ws` + HTTP fallback
- Build: esbuild -> CJS bundle, target Node 18

---

## Rust Feature Flags Reference

| Flag               | Default | Dependencies                                      | Purpose                         |
| ------------------ | ------- | ------------------------------------------------- | ------------------------------- |
| `shell`            | Yes     | tauri-plugin-shell                                | Shell command execution         |
| `updater`          | Yes     | tauri-plugin-updater                              | Auto-update support             |
| `billing`          | Yes     | (none)                                            | Billing/credit features         |
| `vad`              | Yes     | webrtc-vad                                        | Voice activity detection        |
| `devtools`         | No      | tauri/devtools                                    | DevTools in dev builds          |
| `ocr`              | No      | tesseract                                         | OCR (requires system Tesseract) |
| `local-llm`        | No      | llama-cpp-2                                       | Local LLM inference             |
| `local-whisper`    | No      | whisper-rs                                        | Offline speech-to-text          |
| `webrtc-support`   | No      | webrtc                                            | WebRTC peer connections         |
| `sentry`           | No      | sentry                                            | Error tracking                  |
| `remote-databases` | No      | tokio-postgres, mysql_async, mongodb, redis, bson | External DB connections         |

---

## Cargo Workspace

```toml
[workspace]
members = ["apps/desktop/src-tauri", "apps/cli", "crates/sandbox-policy"]
resolver = "2"

[profile.release]
codegen-units = 1
lto = true
opt-level = "z"
strip = true
panic = "abort"
```

### Services (Node.js)

| Service          | Port | Tech                                | Docker                    |
| ---------------- | ---- | ----------------------------------- | ------------------------- |
| API Gateway      | 3000 | Express 5, Supabase, JWT, Zod, Pino | 4-stage alpine, dumb-init |
| Signaling Server | 4000 | Express 5, ws, Supabase, Pino       | 4-stage alpine, dumb-init |

Both use non-root users, health check endpoints (`/health`, `/ready`, `/live`), Helmet security headers, and rate limiting.

---

## CSP Policy Reference

From `tauri.conf.json` -- enforced on all desktop webview content:

```
default-src 'self'; script-src 'self' 'wasm-unsafe-eval';
style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
img-src 'self' data: blob: https://agiworkforce.com https://*.supabase.co;
font-src 'self' https://fonts.gstatic.com https://cdn.jsdelivr.net data:;
connect-src 'self' ipc: https://api.agiworkforce.com https://*.supabase.co wss://*.supabase.co
  https://api.stripe.com http://localhost:11434 http://127.0.0.1:11434;
frame-src 'self' https://js.stripe.com; frame-ancestors 'none';
object-src 'none'; base-uri 'self'; form-action 'self';
```

When adding new external resources, update CSP in both `tauri.conf.json` AND `vite.config.ts` dev server headers.

---

## Development Rules

- Do NOT run tests unless explicitly asked
- Rust/Tauri files: full edit access authorized
- Research the market (web search) before implementing any user-facing feature
- All secrets through SecretManager -- never plaintext, never committed
- ALWAYS use parallel sub-agents -- never sequential when tasks can be parallelized
- Additional per-surface rules exist in `.cursor/rules/` (15 files covering agents, coding style, patterns, security, testing, git, hooks, performance) -- check when editing unfamiliar surfaces

## Workflow Orchestration

### 1. Plan Mode Default

- Enter plan mode for ANY non-trivial task (3+ steps or architectural decisions)
- If something goes sideways, STOP and re-plan immediately
- Write detailed specs upfront to reduce ambiguity

### 2. Subagent Strategy

- Use subagents liberally to keep main context window clean
- Offload research, exploration, and parallel analysis to subagents
- One task per subagent for focused execution

### 3. Self-Improvement Loop

- After ANY correction from the user: update memory with the pattern
- Write rules for yourself that prevent the same mistake

### 4. Verification Before Done

- Never mark a task complete without proving it works
- Ask yourself: "Would a staff engineer approve this?"

### 5. Autonomous Bug Fixing

- When given a bug report: just fix it. Don't ask for hand-holding
- Go fix failing CI tests without being told how

## Core Principles

- **Simplicity First**: Make every change as simple as possible
- **No Laziness**: Find root causes. No temporary fixes
- **Minimal Impact**: Only touch what's necessary
- **File Size**: 200-400 lines typical, 800 max. Extract utilities from large modules
- **Elegance**: For non-trivial changes, pause and ask "is there a more elegant way?"

## Zone-Based File Ownership (Multi-Agent)

| Zone   | Files                                                            |
| ------ | ---------------------------------------------------------------- |
| A      | `apps/desktop/src/components/**`, `apps/desktop/src/pages/**`    |
| B      | `apps/desktop/src/services/**`, `apps/web/api/**`, `services/**` |
| C      | `supabase/migrations/**`                                         |
| D      | `apps/desktop/src/stores/mcpStore*`, `apps/extension/**`         |
| SYSTEM | `apps/desktop/src-tauri/**`, `apps/cli/**`, `crates/**`          |
| SHARED | `package.json`, `tsconfig.json`, `CLAUDE.md`, `packages/**`      |
