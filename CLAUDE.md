# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

AGI Workforce is a Tauri-based desktop application combining AI chat, tool execution, browser automation, terminal control, and workflow orchestration. Built with React (frontend) and Rust (backend), it enables LLMs to interact with desktop systems through a comprehensive tool ecosystem.

**Architecture:** Monorepo managed with pnpm workspaces

- **apps/desktop**: Main Tauri application (React + Rust)
- **packages/types**: Shared TypeScript types
- **packages/utils**: Shared utilities
- **services/**: API gateway and signaling server (future)

## Development Commands

### Initial Setup

```bash
# Install dependencies (requires pnpm ≥9.15.0, Node.js ≥20.11.0)
pnpm install

# First-time build (especially on Windows with 1,040+ crates)
# Note: Debug builds disable all debug info to avoid Windows PDB limits
cd apps/desktop
pnpm dev
```

### Common Development Tasks

```bash
# Run desktop app in development mode
pnpm dev:desktop

# Build desktop app for production
pnpm build:desktop

# Build all packages except desktop
pnpm build:all

# Run tests (all packages)
pnpm test

# Run tests for desktop only
cd apps/desktop && pnpm test

# Run specific test file
cd apps/desktop && pnpm test -- path/to/file.test.ts

# Run tests in watch mode
cd apps/desktop && pnpm vitest

# Run E2E tests with Playwright
cd apps/desktop && pnpm test:e2e
cd apps/desktop && pnpm test:e2e:ui  # With UI
cd apps/desktop && pnpm test:smoke   # Smoke tests only
cd apps/desktop && pnpm test:e2e -- path/to/test.spec.ts  # Specific E2E test

# Type checking
pnpm typecheck           # Desktop only
pnpm typecheck:all       # All packages

# Linting and formatting
pnpm lint                # ESLint (max 15 warnings)
pnpm lint:fix            # Auto-fix issues
pnpm format              # Prettier
pnpm format:check        # Check formatting
```

### Rust-Specific Commands

```bash
# Run Rust tests (from workspace root or apps/desktop/src-tauri)
cargo test
cargo test --package agiworkforce-desktop

# Run specific test module
cargo test --package agiworkforce-desktop automation::tests

# Run specific test with output
cargo test --package agiworkforce-desktop test_name -- --nocapture

# Run single test file
cargo test --test integration_test_file

# Run benchmarks
cargo bench

# Build release (optimized for size)
cargo build --release

# Check without building
cargo check
```

### Debugging

```bash
# Run with Rust logs
RUST_LOG=debug pnpm dev:desktop

# Run with specific module logs
RUST_LOG=agiworkforce_desktop::router=debug pnpm dev:desktop

# Run specific Tauri commands
cd apps/desktop && pnpm tauri dev
cd apps/desktop && pnpm tauri build
```

### Optional Cargo Features

The project supports optional features that can be enabled:

```bash
# Build with OCR support (Tesseract)
cargo build --features ocr

# Build with local LLM support (llama-cpp-2)
cargo build --features local-llm

# Build with WebRTC support (P2P)
cargo build --features webrtc-support

# Build with Sentry error tracking
cargo build --features sentry

# Build with billing support
cargo build --features billing
```

## Architecture Overview

### Frontend Architecture (React + Zustand)

**State Management:** Zustand stores provide reactive state across the application. Key stores include:

- `unifiedChatStore.ts`: Primary chat interface, messages, streaming, conversation management
- `settingsStore.ts`: Application settings, LLM configurations
- `automationStore.ts`: UI automation state, keyboard/mouse input recording
- `browserStore.ts`: Browser automation state, tab management
- `terminalStore.ts`: Terminal sessions, command history
- `mcpStore.ts`: MCP server connections, tools registry
- `sidecarStore.ts`: Sidecar panel state (code, browser, terminal, diff, preview, data, canvas modes)

**Component Structure:**

- `src/components/`: UI components using Radix UI primitives
- `src/pages/`: Route-level page components
- `src/hooks/`: React hooks for Tauri IPC and state
- `src/api/`: Frontend API layer wrapping Tauri commands
- `src/types/`: TypeScript interfaces for chat, automation, tool calling

**Path Aliases:** Configured in vite.config.ts

- `@/`: src root
- `@components/`: src/components
- `@stores/`: src/stores
- `@hooks/`: src/hooks
- `@utils/`: src/utils

**Frontend-Backend IPC Communication**

The frontend communicates with the Rust backend through Tauri's `invoke` API:

```typescript
// Frontend calls backend command
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ResponseType>('command_name', {
  param: value,
});
```

All backend commands follow the pattern:
```rust
#[tauri::command]
async fn command_name(
    state: State<'_, FeatureState>,
    app: AppHandle,
    param: String,
) -> Result<ResponseType, String> {
    // Implementation
}
```

**Event System**: The backend emits events that the frontend listens to:

```typescript
// Frontend listens to backend events
listen<EventPayload>('event-name', (event) => {
    // Handle event
});
```

Key events emitted by backend:
- `chat:stream-start`: Beginning of LLM streaming
- `chat:stream-chunk`: Incoming chunk of streamed content
- `chat:stream-end`: End of stream with final statistics
- `agent:status:update`: Agent execution status changes
- `tool:execution:result`: Tool execution completion
- `approval:request`: Dangerous operation requires approval
- `terminal:output`: Terminal command output

**Error Handling**: Commands return `Result<T, String>` which the frontend handles:

```typescript
try {
  const result = await invoke<T>('command', args);
} catch (error) {
  // error is a string from backend
  handleError(error as string);
}
```

**Timeout Pattern**: Critical operations use timeout wrapping:

```typescript
const TIMEOUT_MS = 30000;  // 30 seconds
Promise.race([
  invoke('command', args),
  new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Timeout')), TIMEOUT_MS)
  )
]);
```

### Backend Architecture (Rust + Tauri)

**Core Pattern: Command → State → Module**

1. **Commands Layer** (`src-tauri/src/commands/`)
   - Tauri IPC command handlers exposed to frontend
   - Each module exports `#[tauri::command]` functions
   - Commands are registered in `main.rs` builder
   - State is managed through Tauri's dependency injection (`State<T>`)

2. **Module Layer** (Top-level modules in `src-tauri/src/`)
   - Core business logic separated from IPC layer
   - Examples: `router/`, `automation/`, `mcp/`, `agi/`, `security/`
   - Contains domain logic, integrations, and implementation details

3. **State Management** (`src-tauri/src/state.rs` and command state wrappers)
   - Global application state managed via `AppState`
   - Per-feature state wrappers (e.g., `LLMState`, `BrowserStateWrapper`)
   - State is injected into commands via `tauri::State<T>`

### Key Subsystems

#### LLM Router (`src-tauri/src/router/`)

Universal LLM interface supporting multiple providers:

- **Providers:** OpenAI, Anthropic, Google, Ollama, xAI, DeepSeek, Mistral, Qwen
- **Features:** Token counting, cost calculation, response caching, streaming
- **Tool Execution:** Function calling with unified tool registry
- **Vision Support:** Multimodal content handling

#### AGI System (`src-tauri/src/agi/`)

Advanced orchestration and reasoning:

- **Core:** AGI planning, execution, and goal management
- **Memory:** Long-term knowledge retention and learning
- **Orchestrator:** Multi-agent coordination with resource locking
- **Process Reasoning:** Outcome tracking and strategy selection
- **Templates:** Built-in workflow templates and agent definitions

#### Automation System (`src-tauri/src/automation/`)

Cross-platform desktop automation:

- **Input:** Keyboard/mouse control via `enigo` (cross-platform)
- **Screen:** Screen capture via `xcap`, OCR integration
- **UIA:** Windows UI Automation for element inspection
- **Vision Planner:** AI-driven UI element targeting
- **Safety:** Dangerous operation detection and approval

#### MCP Integration (`src-tauri/src/mcp/`)

Model Context Protocol client implementation:

- **Architecture:** JSON-RPC 2.0 over STDIO transport
- **Manager:** Server lifecycle (start, stop, health monitoring)
- **Registry:** Tool registration with AGI system
- **Session:** Initialization, capabilities negotiation
- **Events:** Real-time MCP events emitted to frontend

#### Security (`src-tauri/src/security/`)

Multi-layered security system:

- **AuthManager:** JWT-based authentication and sessions
- **SecretManager:** Secure credential storage (OS keyring + DB fallback)
- **Policy Engine:** Fine-grained permission controls
- **Approval System:** Dangerous operation confirmation
- **Guardrails:** Prompt injection detection, rate limiting

#### Browser Automation (`src-tauri/src/browser/`)

Headless browser integration:

- CDP client for Chrome DevTools Protocol
- Playwright bridge for cross-browser automation
- DOM operations and semantic element detection
- Tab management and navigation

#### Database Layer (`src-tauri/src/db/`)

SQLite-based persistence:

- **Migrations:** Schema versioning in `db/migrations.rs`
- **Connection:** Managed via `AppDatabase` state
- **Usage:** Chat history, settings, analytics, user data

## Chat Message Flow & Streaming Architecture

### Message Lifecycle
Messages flow through the system in this pattern:

1. **User Input** → Frontend UI (chat input box)
2. **Optimistic Update** → Add message to store immediately
3. **Backend Request** → `invoke('chat_send_message', { ... })`
4. **Streaming** → LLM response streams as chunks (optional)
5. **Storage** → Messages persisted to SQLite
6. **State Update** → Frontend updates with confirmed data

### Message Types
```typescript
export interface Message {
  id: string;
  conversation_id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  tokens?: number;
  cost?: number;
  created_at: Date;
  artifacts?: Artifact[];          // Generated code/charts/diagrams
  tool_calls?: ToolCall[];         // LLM-requested operations
  tool_results?: ToolResult[];     // Results from executed tools
  metadata?: MessageMetadata;
}

export interface MessageMetadata {
  tokenCount?: number;
  model?: string;
  provider?: string;
  cost?: number;
  duration?: number;
  streaming?: boolean;
  requiresApproval?: boolean;
  sidecarType?: 'browser' | 'terminal' | 'code' | 'video' | 'media' | 'files' | 'data';
}
```

### Streaming Implementation
Streaming uses Tauri events from backend to frontend:

```typescript
// Backend emits chunks during LLM response
emit('chat:stream-chunk', { content: 'text...' });

// Frontend listens and accumulates
listen('chat:stream-chunk', (event) => {
  updateStreamingContent(event.payload.content);
});
```

**Streaming Flow**:
1. User sends message → Backend creates assistant message placeholder
2. Emit `chat:stream-start` event
3. For each chunk from LLM: emit `chat:stream-chunk` event
4. When done: emit `chat:stream-end` event with final stats (tokens, cost)
5. Frontend updates message in store with complete content

**Error During Stream**:
- Partial content buffered in frontend
- `chat:stream-end` emitted with error flag
- User can view accumulated content or retry

## Artifact System

### Artifact Types & Structure
```typescript
export type ArtifactType = 'code' | 'chart' | 'diagram' | 'table' | 'mermaid' | 'document';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title?: string;
  content: string;
  language?: string;           // For code artifacts (javascript, python, etc.)
  metadata?: Record<string, unknown>;
  createdAt?: Date;
  updatedAt?: Date;
}
```

### Artifact Rendering & Interactions
- **Code**: Syntax highlighting with language detection, copy-to-clipboard, download
- **Mermaid**: Diagram rendering from mermaid syntax
- **Tables**: Formatted table display
- **Charts**: Recharts rendering for data visualization
- **Document**: Word/Excel/PDF preview

### Artifact Operations
Users can:
- Copy to clipboard
- Download as file
- Edit in sidecar panel
- Delete from message
- Share via link (future)

## Sidecar System

The sidecar is a resizable right panel that displays contextual information:

```typescript
export type SidecarMode =
  | 'code'      // Code artifacts and editing
  | 'browser'   // Browser automation interface
  | 'terminal'  // Terminal session output
  | 'diff'      // File diff viewer
  | 'preview'   // File preview
  | 'data'      // JSON/CSV data viewer
  | 'canvas'    // Visual canvas
  | 'media';    // Images/video

export interface SidecarState {
  isOpen: boolean;
  activeMode: SidecarMode;
  contextId?: string;  // File path, URL, session ID, etc.
  autoTrigger: boolean;
  content?: any;
}
```

### Auto-Trigger Logic
The sidecar automatically opens when:
- User runs terminal command → terminal sidecar opens
- Browser automation detected → browser sidecar opens
- Code artifact created → code sidecar opens
- File diff generated → diff sidecar opens
- Media generated → media sidecar opens

### Events That Trigger Sidecar
Backend emits special events that trigger sidecar opening:
```typescript
// Terminal command execution
emit('sidecar:request', { mode: 'terminal', context: sessionId });

// Browser navigation
emit('sidecar:request', { mode: 'browser', context: browserUrl });

// Code generation
emit('sidecar:request', { mode: 'code', context: artifactId });
```

## Multimodal LLM Support

### Vision/Image Support
The system supports images in multiple ways:

1. **Screenshot Capture**:
   - User requests AI to "look at screen"
   - Backend captures screenshot via `capture_screen_full` or `capture_screen_region`
   - Converts to base64 PNG/JPEG
   - Adds to LLM request as image content

2. **File Upload**:
   - User uploads PNG, JPEG, GIF, WebP, SVG, PDF
   - Frontend converts to base64 if needed
   - Backend wraps in `ContentPart::Image`
   - Sends to vision-capable LLM

3. **URL Images**:
   - LLM can process image URLs directly (OpenAI, Google Gemini)
   - Backend fetches and converts to base64 for Anthropic

### Provider-Specific Vision Handling
```rust
pub enum ContentPart {
    Text { text: String },
    Image { image: ImageInput },
}

pub struct ImageInput {
    pub data: Vec<u8>,              // Raw bytes
    pub format: ImageFormat,        // Png, Jpeg, Webp
    pub detail: ImageDetail,        // Low, High, Auto
}
```

**OpenAI**: Converts to `image_url` with optional detail parameter
**Google Gemini**: Native multimodal support with high quality
**Anthropic Claude**: Vision via base64 encoded images
**Ollama**: Image support depends on model

### File Upload Processing
Supported formats:
- **Images**: PNG, JPEG, GIF, WebP, SVG
- **Documents**: PDF, DOCX, XLSX
- **Text**: TXT, CSV, JSON, JS, TS, HTML, CSS, Markdown

Process:
1. User selects file
2. Frontend validates type and size
3. Converts to appropriate format (base64 for images, text for documents)
4. Attaches to message
5. Backend processes and adds to LLM context

## Terminal Integration

### Terminal Session Management
```typescript
export interface TerminalSession {
  id: string;
  shell: 'powershell' | 'cmd' | 'bash' | 'zsh' | 'fish';
  cwd: string;
  isActive: boolean;
}

export interface TerminalCommand {
  id: string;
  command: string;
  exitCode?: number;
  stdout?: string;
  stderr?: string;
  duration?: number;
  timestamp: Date;
}
```

### Core Commands
- `terminal_detect_shells()` → List available shells
- `terminal_create_session(shell, cwd)` → Create new session
- `terminal_send_input(session_id, data)` → Execute command
- `terminal_resize(session_id, cols, rows)` → Resize terminal
- `terminal_kill(session_id)` → Kill session
- `terminal_list_sessions()` → List active sessions

### Integration with Chat
- User asks AI to "run command X"
- LLM generates tool call with terminal command
- Approval system gates dangerous commands
- Command executes and output captured
- Output added to chat context
- AI analyzes output and responds

### Cross-Platform Support
- **Windows**: PowerShell, CMD, WSL
- **macOS**: bash, zsh, fish
- **Linux**: bash, zsh, fish

## Browser Automation

### Browser Launch & State
```rust
pub enum BrowserType {
    Chrome,
    Firefox,
    Safari,
}

pub struct BrowserState {
    pub browsers: HashMap<String, BrowserInstance>,
    pub tabs: HashMap<String, TabState>,
}
```

### Core Operations
- `browser_launch(type, headless)` → Start browser
- `browser_navigate(id, url)` → Navigate page
- `browser_click(id, selector)` → Click element
- `browser_type(id, selector, text)` → Type text
- `browser_screenshot(id)` → Capture page
- `browser_get_html(id)` → Extract HTML
- `browser_find_elements(id, selector)` → Query elements

### Element Targeting
Supports multiple selector strategies:
- CSS selectors
- XPath
- Accessibility labels (semantic)
- Role-based queries
- Visual element detection (with AI)

### Integration with Chat
- URL detection → auto-open browser sidecar
- LLM tool calls invoke browser commands
- Screenshots captured and sent back to LLM for analysis
- Multi-step workflows: navigate → analyze → interact

## Tool Execution & Agentic Chat

### Tool System Overview
Tools come from multiple sources:
1. **Built-in Registry**: File ops, terminal, browser, API calls, etc.
2. **MCP (Model Context Protocol)**: External servers providing tools
3. **AI Employees**: Delegated task execution

### Tool Definition
```rust
pub struct ToolDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,  // JSON Schema
}
```

### Execution Flow
1. **LLM generates tool call**: `{ name: "tool_name", arguments: {...} }`
2. **Tool executor matches** tool to definition
3. **Safety check**:
   - Approval system gates dangerous operations
   - Prompt injection detection on inputs
   - Dangerous pattern detection (rm -rf, format, etc.)
4. **Execution**: Runs tool in controlled context
5. **Result wrapping**: Tool result sent back as `tool_result` message
6. **LLM continuation**: LLM processes result and generates next steps

### Approval Workflow
Dangerous operations trigger approval system:

```typescript
export interface ApprovalRequest {
  id: string;
  type: 'file_delete' | 'terminal_command' | 'api_call' | 'data_modification';
  description: string;
  riskLevel: 'low' | 'medium' | 'high';
  details: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  workflowHash?: string;  // For trusted workflow tracking
}
```

**User Actions**:
- `approve_operation(approval_id)` → Allow and optionally remember
- `reject_operation(approval_id)` → Block operation
- Trust workflow → Remember pattern for future similar operations

### Dangerous Operation Detection
**File operations**: Deletion in system directories
**Terminal**: rm -rf, format, deltree, mkfs, and other destructive commands
**System**: Registry modifications, environment variable changes
**Credentials**: Attempts to log passwords/tokens

### Safety Modes
- **Safe Mode (Default)**: All dangerous operations require approval
- **Full Control**: User opt-in to allow all without confirmation

## Error Handling & Edge Cases

### Common Failure Points

#### 1. Database Errors
- Lock contention on `Arc<Mutex<Connection>>`
- Migration failures on startup
- **Mitigation**: Auto-retry with exponential backoff, detailed error logging

#### 2. Streaming Errors
- Network interruption mid-stream
- LLM service timeout
- **Mitigation**: Partial content buffered, can retry, partial message stored

#### 3. Tool Execution Failures
- Command not found
- Permission denied
- Timeout (30 second default)
- **Mitigation**: Error captured in tool result, sent to LLM for analysis

#### 4. Security/Approval
- Timeout on approval wait
- Dangerous pattern detected
- Prompt injection detected
- **Mitigation**: Operation blocked with reason, logged for audit

#### 5. State Synchronization
- Frontend/backend state desync
- Optimistic update fails
- Message ordering issues
- **Mitigation**: DB as source of truth, reconciliation on reconnect

### Timeout Patterns
```typescript
// 30-second timeout for automation operations
const TIMEOUT_MS = 30000;

// Streaming timeout (per chunk)
const CHUNK_TIMEOUT_MS = 60000;

// Approval wait timeout
const APPROVAL_TIMEOUT_MS = 300000;  // 5 minutes
```

### Error Recovery Strategies

**Optimistic Updates**:
```typescript
// 1. Add message optimistically
addOptimisticMessage(content);

// 2. Call backend
invoke('chat_send_message', args)
  .then(() => confirmOptimisticMessage())
  .catch(() => failOptimisticMessage());
```

**Streaming Partial Content**:
- Accumulate chunks even if stream fails
- Show "partial response" UI state
- Offer retry button

**Database Reconnection**:
- Connection pooling with auto-reconnect
- Fallback to in-memory state temporarily
- Reconcile on next successful connection

**Message Deduplication**:
- Each message has unique ID
- Prevent duplicate message insertion
- Server-side deduplication check

## LLM Router & Multi-Provider Architecture

### Supported LLM Providers
The router supports 8+ LLM providers with automatic model selection:

```rust
pub enum Provider {
    OpenAI,      // GPT-5, GPT-5-mini, o3-mini, o1, o1-preview
    Anthropic,   // Claude Opus, Sonnet, Haiku
    Google,      // Gemini 2.5 Pro, Gemini 2.5 Flash
    Ollama,      // Local models (Mistral, Llama, etc.)
    XAI,         // Grok 4, Grok 3
    DeepSeek,    // DeepSeek-V3, DeepSeek-Reasoner
    Qwen,        // Qwen 2.5 Max, Qwen3-Coder
    Mistral,     // Mistral Large 2, Codestral
}
```

### Model Selection Strategy
The router selects models based on context:

```rust
pub struct RouterContext {
    pub intents: Vec<String>,          // 'code', 'devops', 'terminal', 'analysis'
    pub requires_vision: bool,
    pub token_estimate: u32,
    pub cost_priority: CostPriority,   // low, balanced, quality
}
```

**Selection Rules**:
1. **Code/Development** → Anthropic Claude (best for coding)
2. **Vision/Screenshots** → Google Gemini (computer vision)
3. **Long Context** → Upgrade to largest model in provider
4. **Cost-Optimized** → Ollama (local) or gpt-mini
5. **Complex Reasoning** → o3-mini or claude-opus
6. **Default** → OpenAI GPT-5

### Provider Configuration
Users configure API keys in settings:

```typescript
export interface ProviderConfig {
  provider: Provider;
  apiKey: string;
  baseUrl?: string;           // For Ollama or self-hosted
  model?: string;             // Override default model
  temperature?: number;       // 0.0 to 2.0
  maxTokens?: number;
  topP?: number;
  enabled: boolean;
}
```

### Cost Calculation
Each provider/model combination has pricing:

```rust
pub struct CostCalculator {
    prompt_price_per_1k: f64,      // Cost per 1000 prompt tokens
    completion_price_per_1k: f64,  // Cost per 1000 completion tokens
    cache_discount: f64,            // Discount for cached tokens
}
```

**Cumulative Tracking**:
- Per-message cost tracked in metadata
- Per-conversation cost aggregated
- Cost analytics dashboard
- Monthly/yearly budgets with alerts

### Response Caching
Intelligent caching to reduce costs:

```rust
pub struct CacheEntry {
    key: String,                    // Hash of (messages, model, temp)
    response: String,
    tokens: (u32, u32),            // (prompt, completion)
    created_at: DateTime<Utc>,
    ttl: Duration,                  // Default 24 hours
}
```

**Cache Key**: Hash of message history + model + temperature
**Hit Rate**: Typically 10-20% on repeated questions
**Admin**: Clear cache or configure TTL

### Vision Model Selection
Different models for different vision tasks:

```rust
match vision_task {
    VisionTask::Screenshot => Provider::Google,  // Best OCR
    VisionTask::CodeAnalysis => Provider::Anthropic,
    VisionTask::ImageGeneration => Provider::OpenAI,
    VisionTask::ComputerUse => Provider::Google,  // computer-use-capable
}
```

**Vision Capability Matrix**:
- OpenAI: Vision with image detail (low/high/auto)
- Anthropic: Base64 image support, excellent OCR
- Google Gemini: Native multimodal, best for UI analysis
- Ollama: Depends on model

## Important Patterns and Conventions

### Tauri Command Pattern

```rust
#[tauri::command]
pub async fn example_command(
    state: State<'_, ExampleState>,
    app: AppHandle,
    param: String,
) -> Result<ResponseType, String> {
    // Implementation
}
```

### Error Handling

- Backend: Use `anyhow::Result` for internal errors, convert to `Result<T, String>` for commands
- Frontend: Commands return Promise<T> that reject with error strings

### State Management Pattern

```rust
pub struct FeatureState(pub Arc<RwLock<InnerState>>);

impl FeatureState {
    pub fn new() -> Self {
        Self(Arc::new(RwLock::new(InnerState::default())))
    }
}
```

### Frontend-Backend Communication

```typescript
// Frontend calls Tauri command
import { invoke } from '@tauri-apps/api/core';

const result = await invoke<ResponseType>('command_name', {
  param: value,
});
```

### Test Organization

- **Rust:** Unit tests in module files, integration tests in `tests/` subdirectories
- **Frontend:** Vitest for unit tests (`*.test.ts`), Playwright for E2E (`e2e/*.spec.ts`)
- **Mocking:** Use `mockall` for Rust, `msw` for frontend HTTP mocking

## Special Considerations

### Windows-Specific Issues

1. **PDB Limit:** With 1,040+ crates, Windows PDB debug info exceeds 4,096 stream limit
   - **Solution:** Debug builds disable all debug info (`debug = 0` in Cargo.toml)
   - This is normal and expected; use release builds for profiling

2. **UI Automation:** Windows UIA APIs require `unsafe` code blocks (allowed in lints)

3. **Build Tools:** Requires Visual Studio Build Tools on Windows

### Cross-Platform Automation

- **Input:** `enigo` provides cross-platform keyboard/mouse control
- **Screen:** `xcap` handles cross-platform screen capture
- **Clipboard:** `arboard` for cross-platform clipboard access
- **Platform Detection:** Use `cfg(target_os = "windows")` / `cfg(target_os = "macos")` / `cfg(target_os = "linux")`

### Archived Features

The `apps/desktop/src/future_scope/` directory contains disabled features:

- **Purpose:** Future marketplace, employees, ROI dashboard features
- **Status:** Excluded from builds, linting, and type checking
- **Note:** May contain broken imports (expected)

### Memory Management

- Use `Arc<RwLock<T>>` for shared mutable state across async boundaries
- Use `Arc<Mutex<T>>` for simple cases, `parking_lot::RwLock` for hot paths
- `DashMap` for concurrent hash maps without explicit locking

### Security Model

- **Safe Mode:** Default mode requiring approval for dangerous operations
- **Full Control:** All tools execute without confirmation (user opt-in)
- **Audit Logging:** All tool executions logged for compliance
- **Prompt Injection:** Automatic detection and blocking

## Code Quality Standards

### Rust

- **Zero Warnings Policy:** `#![deny(warnings)]` in production code
- **Allowed:** `unsafe_code` (Windows API), `unused_results` (intentional), `unused_qualifications` (clarity)
- **Testing:** Use `#[cfg(test)]` modules, `serial_test` for sequential tests

### TypeScript

- **Max Warnings:** 15 warnings allowed (gradually decreasing)
- **Strict Mode:** TypeScript strict checks enabled
- **Path Aliases:** Use @ imports for cleaner paths

### Pre-commit Hooks

Husky + lint-staged automatically:

- Runs ESLint with auto-fix on staged .ts/.tsx/.js files
- Runs Prettier on staged files
- Validates commit messages (conventional commits)

## Troubleshooting

### Build Failures

- **Windows PDB errors:** This is handled in Cargo.toml; if you see LNK1318, check profile settings
- **Missing dependencies:** Run `pnpm install` from workspace root
- **Rust toolchain:** Ensure Rust ≥1.90.0 (`rustup update`)

### Development Issues

- **Port conflicts:** Vite auto-detects available ports starting from 5173
- **Tauri not found:** Run `pnpm install` to install `@tauri-apps/cli`
- **Type errors in future_scope:** Expected; this directory is excluded from builds

### Performance

- **Slow builds:** First Rust build takes 5-10 minutes; subsequent builds are incremental
- **Hot reload:** Frontend has HMR; Rust changes require full rebuild
- **Memory usage:** Development mode uses more memory; release builds are optimized

## Resources & Documentation

### Official Documentation
- **Tauri**: https://tauri.app/ - Desktop application framework
- **React**: https://react.dev/ - UI framework
- **Zustand**: https://github.com/pmndrs/zustand - State management
- **Radix UI**: https://www.radix-ui.com/ - Accessible UI components

### Protocol & Integration Standards
- **MCP Specification**: https://spec.modelcontextprotocol.io/ - Model Context Protocol
- **OpenAI API**: https://platform.openai.com/docs/api-reference - LLM API reference
- **Anthropic Claude**: https://docs.anthropic.com/ - Claude documentation
- **Google Gemini**: https://ai.google.dev/docs - Gemini API

### Key Source Files for Reference
- **Chat Store**: `apps/desktop/src/stores/unifiedChatStore.ts`
- **Main Backend**: `apps/desktop/src-tauri/src/main.rs`
- **Chat Commands**: `apps/desktop/src-tauri/src/commands/chat.rs`
- **LLM Router**: `apps/desktop/src-tauri/src/router/mod.rs`
- **Tool Executor**: `apps/desktop/src-tauri/src/router/tool_executor.rs`
- **Automation**: `apps/desktop/src-tauri/src/automation/executor.rs`
- **Browser**: `apps/desktop/src-tauri/src/browser/mod.rs`
- **Terminal**: `apps/desktop/src-tauri/src/commands/terminal.rs`
- **Security**: `apps/desktop/src-tauri/src/security/mod.rs`

### Project Links
- **GitHub Repository**: https://github.com/siddharthanagula3/agiworkforce-desktop-app
- **Issues & Bug Reports**: https://github.com/siddharthanagula3/agiworkforce-desktop-app/issues
- **Discussions**: https://github.com/siddharthanagula3/agiworkforce-desktop-app/discussions
- **Security Policy**: See SECURITY.md in repository root
