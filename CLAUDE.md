# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AGI Workforce is an AI-powered desktop automation platform that enables users to automate complex, multi-step workflows across Windows applications using natural language commands. The project is built as a **Tauri-based desktop application** with a React frontend and Rust backend.

**Architecture Philosophy:**
- **Tauri hybrid model**: React UI layer communicates with Rust backend via IPC commands
- **Multi-LLM routing**: Intelligent selection of optimal AI model for each task with cost optimization
- **Modular Control Primitives (MCPs)**: Extensible automation capabilities including browser automation, code editing, terminal access, file management, database operations, API client, and more
- **Persistent sidebar UI**: 360-480px width chat interface that remains accessible while working in any application

**Current Status**: 12 of 18 Milestones Complete (67%)
- ✅ M1-M5: Foundation, UI Shell, Chat, LLM Router, Windows Automation
- ✅ M6-M11: Browser, Code Editor, Terminal, Filesystem, Database, API MCPs
- ✅ M15: Cloud Storage
- ⏳ M12-M14, M16-M18: Communications, Calendar, Productivity, Document, Mobile, Security (pending)

## Development Commands

### Setup
```bash
# Install all dependencies (required after clone)
pnpm install

# Initialize Git hooks (runs automatically via prepare script)
# Manual trigger if needed: pnpm prepare
```

### Desktop App Development
```bash
# Start dev server (Vite + Tauri hot reload)
cd apps/desktop
pnpm dev

# Build production bundle (TypeScript + Vite + Tauri)
pnpm build

# Build frontend only (without Tauri packaging)
pnpm build:web

# Preview production build
pnpm preview
```

### Code Quality
```bash
# Lint all TypeScript/JavaScript files in monorepo
pnpm lint

# Auto-fix linting issues
pnpm lint:fix

# Format all files with Prettier
pnpm format

# Check formatting without modifying files
pnpm format:check

# Type-check TypeScript across workspace
pnpm typecheck
```

### Testing
```bash
# Run all desktop app tests (Vitest)
cd apps/desktop
pnpm test

# Run tests with UI
pnpm test:ui

# Generate coverage report
pnpm test:coverage

# Run specific test file
pnpm test -- useOCR.test.ts
```

### Tauri-Specific
```bash
# Run Tauri CLI directly
cd apps/desktop
pnpm tauri <command>

# Build Rust backend only
cd apps/desktop/src-tauri
cargo build

# Run Rust tests
cargo test

# Build with release optimizations
cargo build --release
```

## High-Level Architecture

### Monorepo Structure

**pnpm workspace** with the following layout:
- `apps/desktop` - Tauri desktop application (React + Rust)
- `apps/mobile` - Mobile companion (future)
- `apps/extension` - Browser extension (future)
- `packages/types` - Shared TypeScript type definitions
- `packages/utils` - Shared utility functions
- `packages/ui-components` - Shared React components
- `services/api-gateway` - Backend API service (future)
- `services/signaling-server` - WebRTC signaling for P2P (future)
- `services/update-server` - Auto-update distribution (future)

### Desktop App Architecture

**Frontend (React/TypeScript)**:
- **State Management**: Zustand stores with persistence for all MCPs (browser, code, terminal, filesystem, database, API, chat, settings, costs)
- **UI Framework**: Radix UI primitives + Tailwind CSS
- **Component Structure**:
  - `Layout/` - TitleBar (custom window controls), Sidebar (12 nav items), DockingSystem
  - `Chat/` - ChatInterface, MessageList, InputComposer, ArtifactRenderer
  - `Browser/` - BrowserWorkspace with Playwright integration
  - `Code/` - CodeWorkspace with Monaco editor, FileTree, DiffViewer
  - `Terminal/` - TerminalWorkspace with xterm.js, multi-shell support
  - `Filesystem/` - FilesystemWorkspace with file browser, CRUD operations
  - `Database/` - DatabaseWorkspace with SQL/MongoDB/Redis clients
  - `API/` - APIWorkspace with HTTP client and OAuth 2.0
  - `Analytics/` - CostDashboard, CostSidebarWidget
  - `Settings/` - SettingsPanel, ModelPreferences, Permissions
  - `Migration/` - LovableMigrationWizard
- **Hooks**: Custom hooks for Tauri IPC, keyboard shortcuts, OCR, screen capture, window management
- **Path Aliases**: `@/`, `@components/`, `@stores/`, `@hooks/`, `@utils/`, `@types/`, `@lib/`, `@assets/`

**Backend (Rust/Tauri)**:
- **Core Modules** (`src-tauri/src/`):
  - `commands/` - Tauri IPC command handlers for all MCPs:
    - `browser.rs` - Playwright browser automation (60+ commands)
    - `code.rs` - File operations, Monaco integration
    - `terminal.rs` - Multi-shell terminal management
    - `file_ops.rs` - Filesystem CRUD with permissions
    - `database.rs` - SQL/MongoDB/Redis clients with connection pooling
    - `api.rs` - HTTP client with OAuth 2.0 flows
    - `ocr.rs` - Tesseract OCR integration
    - `chat.rs`, `llm.rs` - LLM routing and chat management
    - `window.rs`, `settings.rs`, `migration.rs`, `capture.rs`
  - `state.rs` - AppState with window geometry, dock position, pinned state
  - `tray.rs` - System tray integration
  - `window/` - Window management (docking, always-on-top, visibility)
  - `router/` - Multi-LLM routing and cost optimization
  - `automation/` - Windows UI Automation API integration
  - `db/` - SQLite database layer (rusqlite + tokio-rusqlite)
  - `security/` - Permission system with audit logging
  - `providers/` - LLM provider integrations (OpenAI, Anthropic, etc.)
  - `telemetry/` - Logging, tracing, and metrics

**Key Design Patterns**:
- **Frontend-Backend Communication**: React calls Rust via `invoke()` from `@tauri-apps/api/core`, Rust emits events via Tauri's `emit()`, React listens via `listen()` from `@tauri-apps/api/event`
- **State Synchronization**: Zustand stores persist to localStorage (frontend) and SQLite (backend via Tauri commands)
- **Stream Processing**: Chat responses stream from backend using Tauri events (`chat:stream:start`, `chat:stream:chunk`, `chat:stream:end`)
- **Window Management**: Custom title bar with React controls + Rust window manipulation via Windows API

### Tauri Window Configuration

**Main Window** (defined in `tauri.conf.json`):
- Size: 420x680 (min: 360x520, max: 480x840)
- Decorations: false (custom title bar)
- Transparent: true (rounded corners)
- Always on top: Configurable via pin button
- Docking: Snaps to screen edges via keyboard shortcuts (Ctrl+Alt+Left/Right/Up/Down)

**Content Security Policy**:
- Allows WebSocket connections (`ws:`, `wss:`) for real-time communication
- Allows data URIs for images (`data:`, `blob:`)
- Unsafe inline styles permitted for Tailwind
- WASM evaluation enabled for Monaco editor

## Coding Conventions

### TypeScript/React
- **Strict mode enabled**: Use explicit types, avoid `any`
- **Functional components**: Use hooks instead of class components
- **Import order**: React → Tauri APIs → third-party → local (enforced by ESLint import plugin)
- **Naming**:
  - Components: PascalCase (`ChatInterface.tsx`)
  - Hooks: camelCase with `use` prefix (`useOCR.ts`)
  - Stores: camelCase with `Store` suffix (`chatStore.ts`)
  - Types: PascalCase interfaces/types (`Message`, `Conversation`)
- **File structure**: Co-locate tests with source files using `__tests__/` directories

### Rust
- **Error handling**: Use `anyhow::Result` for application errors, `thiserror` for custom error types (see `error.rs`)
- **Async**: Tokio runtime with `async-trait` for trait implementations
- **Serialization**: `serde` for all IPC data structures
- **Logging**: Use `tracing` macros (`info!`, `warn!`, `error!`, `debug!`) instead of `println!`
- **Naming**: Snake_case for modules, functions; PascalCase for types, traits

### Commit Messages
- **Conventional Commits** enforced via Commitlint
- Format: `type(scope): description`
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`
- Examples:
  - `feat(chat): add streaming response support`
  - `fix(ocr): handle empty screenshot buffer`
  - `refactor(router): optimize LLM selection algorithm`

## Critical Implementation Details

### Tauri IPC Patterns

**Calling Rust from React**:
```typescript
import { invoke } from '@tauri-apps/api/core';

// Simple command
const result = await invoke<ReturnType>('command_name', { param: value });

// Error handling
try {
  await invoke('risky_command');
} catch (error) {
  console.error('Rust command failed:', error);
}
```

**Listening to Rust events**:
```typescript
import { listen } from '@tauri-apps/api/event';

const unlisten = await listen<PayloadType>('event-name', (event) => {
  console.log('Received:', event.payload);
});

// Cleanup
unlisten();
```

**Emitting from Rust**:
```rust
use tauri::{Manager, Emitter};

app_handle.emit("event-name", payload)?;
```

### State Management with Zustand

**Store Pattern** (see `chatStore.ts`, `settingsStore.ts`):
- Use `create()` for stores
- Wrap with `persist()` middleware for localStorage sync
- Define async actions that call Tauri commands
- Update state immutably

**Integration with Tauri**:
```typescript
const useStore = create<State>()(
  persist(
    (set, get) => ({
      data: [],
      load: async () => {
        const result = await invoke('load_data');
        set({ data: result });
      },
    }),
    { name: 'store-name', storage: createJSONStorage(() => localStorage) }
  )
);
```

### Screen Capture + OCR Pipeline

1. **User triggers capture** (keyboard shortcut or button)
2. **Frontend calls** `invoke('capture_screen_region', { x, y, width, height })`
3. **Rust backend**:
   - Uses `screenshots` crate to capture screen buffer
   - Saves to temp file
   - Optionally runs OCR via `tesseract` feature flag
   - Returns `CaptureResult` with image path, dimensions, text
4. **Frontend displays** in `CapturePreview`, allows attachment to chat

### LLM Routing Flow

1. **User sends message** via `ChatInterface`
2. **chatStore.sendMessage()** calls `invoke('chat_send_message', { content, routing })`
3. **Rust router** (`src-tauri/src/router/`):
   - Analyzes task complexity
   - Checks user preferences and cost constraints
   - Selects optimal LLM (GPT-4, Claude, Gemini, local model)
   - Streams response via events
4. **Frontend listens** to `chat:stream:chunk` and updates UI incrementally
5. **Cost tracking** updated via `costStore` after completion

### MCP Architecture Pattern

All Modular Control Primitives follow a consistent architecture:

**Store Structure** (`stores/[mcp]Store.ts`):
```typescript
interface Store {
  // Current state
  currentData: Data;
  loading: boolean;
  error: string | null;

  // Actions - operations
  executeOperation: (params) => Promise<Result>;

  // Actions - UI state
  clearError: () => void;
}
```

**Workspace Component** (`components/[MCP]/[MCP]Workspace.tsx`):
- **Toolbar**: Title, icon, primary actions
- **Main Content**: Often tab-based (Request/Response, Editor/Preview, etc.)
- **Status Bar**: Optional metadata display
- **Consistent styling**: Radix UI + Tailwind with design tokens

**Backend Commands** (`src-tauri/src/commands/[mcp].rs`):
```rust
#[tauri::command]
pub async fn mcp_operation(
    param: Type,
    state: State<'_, AppState>,
) -> Result<ReturnType, String> {
    // Permission checks
    // Execute operation
    // Audit logging
}
```

**Integration** (Sidebar + App.tsx):
1. Add to `NavSection` type union
2. Import icon from lucide-react
3. Add `<SidebarNavItem />` to navigation
4. Add conditional render in `App.tsx`

### Database Schema

**SQLite tables** (managed in `src-tauri/src/db/`):
- `conversations` - Chat history metadata
- `messages` - Individual messages with role, content, tokens
- `settings` - User preferences (JSON blob)
- `automation_history` - Executed automation tasks
- `cost_tracking` - Per-task LLM costs with timestamps
- `audit_log` - Security audit trail for all operations

**Migration pattern**: Versioned schema with `PRAGMA user_version`

## Testing Strategy

**Unit tests**: Vitest for React hooks and utilities
**Component tests**: Testing Library for React components
**Integration tests**: Tauri's test harness for IPC (future)
**E2E tests**: Playwright for full automation flows (future)

**Coverage targets**: Aim for >70% on business logic (stores, hooks, Rust modules)

## Known Gotchas

1. **Windows API threading**: UI Automation calls must run on separate thread to avoid deadlocks
2. **Tauri file paths**: Use `@tauri-apps/plugin-fs` for cross-platform file operations, not Node.js `fs`
3. **Monaco editor**: Large bundle size (~2MB), lazy load via dynamic import
4. **SQLite locking**: Use `tokio-rusqlite` for async operations to prevent blocking main thread
5. **WebView2 availability**: Desktop app requires Windows 11 with WebView2 runtime pre-installed
6. **Docking state sync**: Window position must be persisted on every move to handle crashes gracefully

## Product Context

This application is designed to **displace Lovable** (competitor) by offering:
- Native Windows integration (not browser-based)
- Cost transparency and optimization
- Extensible automation via MCPs
- Offline-capable local LLM support

**Target timeline**: Reach Lovable feature parity by Day 45, $100M ARR by Month 5 (see `AGI_Workforce_PRD_v4_0.md` for full roadmap).

**Current phase**: Phase 3+ (67% complete)
- ✅ **Completed**: Foundation, UI Shell, Chat, LLM Router, Windows Automation, Browser, Code Editor, Terminal, Filesystem, Database, API, Cloud Storage
- ⏳ **In Progress**: Communications, Calendar, Productivity MCPs
- 📋 **Pending**: Document MCP, Mobile Companion, Security & Polish

See `IMPLEMENTATION_COMPLETE.md` for detailed implementation summary.
